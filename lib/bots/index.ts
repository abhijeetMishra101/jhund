/**
 * lib/bots/index.ts
 *
 * Core bot runtime. Owns three responsibilities:
 *   1. Channel → bot resolution  (getBotForChannel, resolveBotForMessage)
 *   2. Claude invocation          (respondToMessage — builds history, calls the API,
 *                                  runs the read/list tool loop)
 *   3. Tool dispatch              (interprets every tool_use Claude returns and fans
 *                                  out to GitHub, feature-stage, decisions helpers)
 */
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { buildMessageHistory } from './context'
import { READ_GITHUB_FILE_TOOL, LIST_DIRECTORY_TOOL, PROPOSE_GITHUB_ACTION_TOOL, ADVANCE_FEATURE_STAGE_TOOL, CREATE_FEATURE_TOOL, RECORD_DECISION_TOOL, DOCUMENT_DISCUSSION_TOOL, UNDO_DECISION_TOOL } from './tools'
import { readGithubFile, listDirectory, FileNotFoundError, FileAccessDeniedError, DirectoryNotFoundError, DirectoryAccessDeniedError } from '@/lib/github/reader'
import { isAutoApprovable } from './auto-approve'
import { executePlanActions } from '@/lib/github/executor'
import { advanceStage } from '@/lib/feature-stages'
import { getDispatchTargets, postHandoffMessage } from '@/lib/feature-stages/dispatch'
import { recordDecision } from '@/lib/decisions/record'
import { postDecisionMessage, markDecisionDispatched, postDecisionSummary } from '@/lib/decisions/dispatch'
import { commitDiscussionDoc } from '@/lib/decisions/github-commit'
import { undoDecision } from '@/lib/decisions/undo'
import { getRoleSystemPrompt } from '@/lib/templates/roles'
import type { BotRole } from '@/lib/supabase/types'
import type { GateType } from '@/lib/feature-stages'

export { READ_GITHUB_FILE_TOOL, LIST_DIRECTORY_TOOL, PROPOSE_GITHUB_ACTION_TOOL, ADVANCE_FEATURE_STAGE_TOOL, CREATE_FEATURE_TOOL, RECORD_DECISION_TOOL, DOCUMENT_DISCUSSION_TOOL, UNDO_DECISION_TOOL } from './tools'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Public API ──────────────────────────────────────────────────────────────

/** Returns the bot_role configured for a channel, or null if none assigned */
export async function getBotForChannel(channelId: string): Promise<BotRole | null> {
  const supabase = createServiceClient()

  const { data: channel } = await supabase
    .from('channels')
    .select('bot_role_id')
    .eq('id', channelId)
    .single()

  if (!channel?.bot_role_id) return null

  const { data: botRole } = await supabase
    .from('bot_roles')
    .select()
    .eq('id', channel.bot_role_id)
    .single()

  return botRole ?? null
}

/**
 * Resolves which bot should respond to a message in a channel.
 *
 * Multi-bot routing rules:
 * - If the message starts with @Name, route to the named bot (case-insensitive)
 * - Otherwise route to the primary bot (is_primary = true) in channel_members
 * - Falls back to channels.bot_role_id if no channel_members rows exist
 */
export async function resolveBotForMessage(
  channelId: string,
  messageContent?: string
): Promise<BotRole | null> {
  const supabase = createServiceClient()

  // Fetch all members of this channel ordered by insert time (primary first)
  const { data: memberRows } = await supabase
    .from('channel_members')
    .select('bot_role_id, is_primary')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })

  if (!memberRows || memberRows.length === 0) {
    // Fallback: legacy single-bot via channels.bot_role_id
    return getBotForChannel(channelId)
  }

  // Fetch bot_role details for all members
  const botRoleIds = memberRows.map((m) => m.bot_role_id)
  const { data: botRoleRows } = await supabase
    .from('bot_roles')
    .select()
    .in('id', botRoleIds)

  const botRoleMap = new Map<string, BotRole>((botRoleRows ?? []).map((b) => [b.id, b]))

  // If message starts with @Name, try to match a bot
  if (messageContent) {
    const mentionMatch = messageContent.match(/^@(\w+)/i)
    if (mentionMatch) {
      const mentionedName = mentionMatch[1].toLowerCase()
      const mentionedRow = memberRows.find((m) => {
        const bot = botRoleMap.get(m.bot_role_id)
        return bot?.display_name?.toLowerCase() === mentionedName
      })
      if (mentionedRow) return botRoleMap.get(mentionedRow.bot_role_id) ?? null
    }
  }

  // Default: primary bot
  const primaryRow = memberRows.find((m) => m.is_primary) ?? memberRows[0]
  return botRoleMap.get(primaryRow.bot_role_id) ?? null
}

/**
 * Generates a bot reply for the given channel and stores it as a message row.
 *
 * Flow:
 *   1. Resolve which bot should respond (multi-bot routing)
 *   2. Build message history (last 20 turns)
 *   3. Call Claude with cached system prompt + propose_github_action tool
 *   4a. If Claude used the tool: create a plans row (status=pending), store message with plan_id
 *   4b. Otherwise: store plain text reply
 *   5. Return stored message id
 *
 * @param channelId - The channel to respond in
 * @param workspaceId - The workspace (used for context)
 * @param parentMessageId - If set, bot reply is posted as a thread reply
 * @param messageContent - The triggering message content (used for @mention routing)
 */
export async function respondToMessage(
  channelId: string,
  workspaceId: string,
  parentMessageId?: string,
  messageContent?: string
): Promise<string> {
  const supabase = createServiceClient()

  // 1. Resolve bot role (supports multi-bot @mention routing)
  const botRole = await resolveBotForMessage(channelId, messageContent)
  if (!botRole) throw new Error(`No bot configured for channel ${channelId}`)

  // 2. Build conversation history (pass workspaceId so trigger-only system
  //    messages are included while confirmation/error chips are excluded)
  const messageHistory = await buildMessageHistory(channelId, 20, workspaceId)

  if (messageHistory.length === 0) {
    throw new Error('No messages to respond to')
  }

  // 3. Fetch workspace name so we can generate the system prompt fresh from code.
  // We intentionally do NOT use botRole.system_prompt from the DB — prompts are
  // always derived from the latest roles.ts so every workspace gets improvements
  // on deploy without re-seeding or migrations.
  const { data: workspaceRow } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', workspaceId)
    .single()

  const systemPromptText = workspaceRow?.name
    ? getRoleSystemPrompt(botRole.role_key, workspaceRow.name)
    : botRole.system_prompt // fallback: should never happen in practice

  // 4. Call Claude with cached system prompt + tools, with read loop for read_github_file
  //
  // MAX_READ_ITERATIONS caps how many consecutive read_github_file / list_directory
  // rounds Claude can make before we break out and hand off to the action-dispatch
  // path. 5 is enough for realistic multi-file explorations (e.g. listing a directory
  // then reading 3-4 files) without allowing runaway tool loops on edge-case inputs.
  // If the cap is hit, execution falls through to the tool-dispatch block below where
  // Claude's last response is handled normally — it won't silently drop work.
  const MAX_READ_ITERATIONS = 5
  const tools = [READ_GITHUB_FILE_TOOL, LIST_DIRECTORY_TOOL, PROPOSE_GITHUB_ACTION_TOOL, ADVANCE_FEATURE_STAGE_TOOL, CREATE_FEATURE_TOOL, RECORD_DECISION_TOOL, DOCUMENT_DISCUSSION_TOOL, UNDO_DECISION_TOOL]
  const system = [
    {
      type: 'text' as const,
      text: systemPromptText,
      cache_control: { type: 'ephemeral' as const },
    },
  ]

  // Mutable messages array so we can append tool_results for read_github_file
  const messages = [...messageHistory]

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    tools,
    system,
    messages,
  })

  // Read loop — intercept read_github_file tool calls and resolve them immediately.
  // Claude may call multiple read_github_file tools in parallel in a single response.
  // We must provide tool_result blocks for EVERY tool_use in the response — missing
  // any one causes a 400 "tool_use ids without tool_result blocks" error from the API.
  // Runs up to MAX_READ_ITERATIONS times; breaks when there are no read_github_file
  // calls in the response (Claude called another tool or returned text).
  for (let iteration = 0; iteration < MAX_READ_ITERATIONS; iteration++) {
    // Collect ALL read_github_file and list_directory tool_use blocks from this response (parallel reads)
    const readBlocks = response.content.filter(
      (b) => b.type === 'tool_use' &&
        ((b as Anthropic.ToolUseBlock).name === 'read_github_file' ||
         (b as Anthropic.ToolUseBlock).name === 'list_directory')
    ) as Anthropic.ToolUseBlock[]

    if (readBlocks.length === 0) break // Claude called another tool or returned text — hand off

    // Resolve all file reads and directory listings in parallel, one tool_result per tool_use block
    const toolResults = await Promise