import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { buildMessageHistory } from './context'
import type { BotRole } from '@/lib/supabase/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Tool definition for proposing GitHub actions — injected into every Claude call
const PROPOSE_GITHUB_ACTION_TOOL: Anthropic.Tool = {
  name: 'propose_github_action',
  description:
    'Propose one or more GitHub actions for the founder to approve in a single click. ' +
    'Pass all steps as an ordered array — they execute in sequence after approval. ' +
    'To write a file and open a PR, include commit_file as the first action and create_pr as the second. ' +
    'Never take GitHub actions directly — always use this tool.',
  input_schema: {
    type: 'object' as const,
    properties: {
      plain_english_description: {
        type: 'string',
        description: 'Plain English summary of the full set of actions, shown to the founder for approval',
      },
      actions: {
        type: 'array',
        description: 'Ordered list of GitHub actions to execute in sequence after approval.',
        items: {
          type: 'object',
          properties: {
            action_type: {
              type: 'string',
              enum: ['commit_file', 'create_pr', 'create_issue', 'comment_pr', 'comment_issue'],
            },
            payload: {
              type: 'object',
              description:
                'Fields per action_type:\n' +
                '- commit_file: { file_path, content, commit_message, branch } — branch must be like "bot/describe-change"\n' +
                '- create_pr: { title, body, head_branch, base_branch } — head_branch must match the branch from commit_file\n' +
                '- create_issue: { title, body, labels[] }\n' +
                '- comment_pr: { pr_number, body }\n' +
                '- comment_issue: { issue_number, body }',
              properties: {
                file_path: { type: 'string' },
                content: { type: 'string' },
                commit_message: { type: 'string' },
                branch: { type: 'string' },
                head_branch: { type: 'string' },
                base_branch: { type: 'string' },
                title: { type: 'string' },
                body: { type: 'string' },
                labels: { type: 'array', items: { type: 'string' } },
                pr_number: { type: 'integer' },
                issue_number: { type: 'integer' },
              },
            },
          },
          required: ['action_type', 'payload'],
        },
      },
    },
    required: ['plain_english_description', 'actions'],
  },
}

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

  // 2. Build conversation history
  const messageHistory = await buildMessageHistory(channelId, 20)

  if (messageHistory.length === 0) {
    throw new Error('No messages to respond to')
  }

  // 3. Call Claude with cached system prompt + plan-gate tool
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools: [PROPOSE_GITHUB_ACTION_TOOL],
    system: [
      {
        type: 'text',
        text: botRole.system_prompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: messageHistory,
  })

  // 4a. Check if Claude proposed a GitHub action via tool use
  const toolUseBlock = response.content.find((b) => b.type === 'tool_use') as
    | Anthropic.ToolUseBlock
    | undefined

  if (toolUseBlock) {
    const input = toolUseBlock.input as {
      plain_english_description: string
      actions: Array<{ action_type: string; payload: Record<string, unknown> }>
    }

    console.log('[bot:tool_use] channel=%s role=%s actions=%s', channelId, botRole.role_key,
      JSON.stringify((input.actions ?? []).map((a) => a.action_type)))

    // Get any text Claude included alongside the tool call
    const textBlock = response.content.find((b) => b.type === 'text') as
      | Anthropic.TextBlock
      | undefined
    const introText = textBlock?.text?.trim() ?? ''

    const displayDescription = input.plain_english_description
    const botMessage =
      introText
        ? `${introText}\n\n**Proposed action:** ${displayDescription}`
        : `I'd like to: **${displayDescription}**\n\nPlease approve or reject this action.`

    const actions = input.actions ?? []
    if (!actions.length) {
      throw new Error('propose_github_action called with an empty actions array — bot configuration issue')
    }

    // Create the plan row first
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .insert({
        channel_id: channelId,
        bot_role_id: botRole.id,
        description_md: displayDescription,
        github_actions: actions as unknown as import('@/lib/supabase/types').Json,
        status: 'pending',
      })
      .select('id')
      .single()

    if (planError || !plan) {
      throw new Error(`Failed to create plan: ${planError?.message ?? 'no data'}`)
    }

    // Store bot message linked to the plan
    const { data: stored, error: insertError } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        author_type: 'bot',
        author_id: botRole.id,
        content: botMessage,
        plan_id: plan.id,
        ...(parentMessageId ? { parent_id: parentMessageId } : {}),
      })
      .select('id')
      .single()

    if (insertError || !stored) {
      throw new Error(`Failed to store bot reply: ${insertError?.message ?? 'no data'}`)
    }

    return stored.id
  }

  // 4b. Plain text reply — no GitHub action proposed
  const replyText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as Anthropic.TextBlock).text)
    .join('\n')
    .trim()

  if (!replyText) throw new Error('Claude returned an empty response')

  const { data: stored, error: insertError } = await supabase
    .from('messages')
    .insert({
      channel_id: channelId,
      author_type: 'bot',
      author_id: botRole.id,
      content: replyText,
      ...(parentMessageId ? { parent_id: parentMessageId } : {}),
    })
    .select('id')
    .single()

  if (insertError || !stored) {
    throw new Error(`Failed to store bot reply: ${insertError?.message ?? 'no data'}`)
  }

  return stored.id
}
