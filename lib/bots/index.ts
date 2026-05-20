import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { buildMessageHistory } from './context'
import { PROPOSE_GITHUB_ACTION_TOOL, ADVANCE_FEATURE_STAGE_TOOL, CREATE_FEATURE_TOOL } from './tools'
import { advanceStage } from '@/lib/feature-stages'
import { getDispatchTargets, postHandoffMessage } from '@/lib/feature-stages/dispatch'
import type { BotRole } from '@/lib/supabase/types'
import type { GateType } from '@/lib/feature-stages'

export { PROPOSE_GITHUB_ACTION_TOOL, ADVANCE_FEATURE_STAGE_TOOL, CREATE_FEATURE_TOOL } from './tools'

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

  // 2. Build conversation history
  const messageHistory = await buildMessageHistory(channelId, 20)

  if (messageHistory.length === 0) {
    throw new Error('No messages to respond to')
  }

  // 3. Call Claude with cached system prompt + tools
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools: [PROPOSE_GITHUB_ACTION_TOOL, ADVANCE_FEATURE_STAGE_TOOL, CREATE_FEATURE_TOOL],
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

  // 4a-i. Handle create_feature tool
  if (toolUseBlock?.name === 'create_feature') {
    const input = toolUseBlock.input as {
      title: string
      description: string
      complexity: 'hotfix' | 'small' | 'medium' | 'large'
    }

    let systemContent: string
    try {
      const { data: feature, error: featureError } = await supabase
        .from('features')
        .insert({
          workspace_id: workspaceId,
          title: input.title.trim(),
          description: input.description.trim(),
          complexity: input.complexity,
          stage: 1,
          status: 'active' as const,
        })
        .select('id')
        .single()

      if (featureError || !feature) {
        throw new Error(featureError?.message ?? 'Insert returned no data')
      }

      systemContent = `✓ Feature "${input.title}" created in Pipeline (Stage 1 — Idea). ID: ${feature.id}`
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      systemContent = `Failed to create feature: ${message}`
    }

    const { data: stored, error: insertError } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        author_type: 'system',
        author_id: botRole.id,
        content: systemContent,
        ...(parentMessageId ? { parent_id: parentMessageId } : {}),
      })
      .select('id')
      .single()

    if (insertError || !stored) {
      throw new Error(`Failed to store system message: ${insertError?.message ?? 'no data'}`)
    }

    return stored.id
  }

  // 4a-ii. Handle advance_feature_stage tool
  if (toolUseBlock?.name === 'advance_feature_stage') {
    const input = toolUseBlock.input as {
      feature_id: string
      to_stage: number
      gate_type: GateType
      notes: string
    }

    let systemContent: string
    try {
      // Fetch feature title before advancing (for handoff messages)
      const { data: featureRow } = await supabase
        .from('features')
        .select('title')
        .eq('id', input.feature_id)
        .single()
      const featureTitle = featureRow?.title ?? 'Feature'

      await advanceStage(input.feature_id, input.to_stage, input.gate_type, botRole.role_key, input.notes)
      systemContent = `✓ Feature advanced to stage ${input.to_stage}: ${input.notes}`

      // Dispatch handoff to next stage owners (fire-and-forget, non-blocking)
      getDispatchTargets(workspaceId, input.to_stage)
        .then(async (targets) => {
          if (targets.length === 0) return
          const { parallel } = targets[0]

          const dispatchOne = async (target: typeof targets[0]) => {
            try {
              await postHandoffMessage(target.channelId, featureTitle, input.to_stage)
              await respondToMessage(target.channelId, workspaceId)
            } catch (err) {
              console.error('[dispatch] Handoff failed for channel', target.channelId, err)
            }
          }

          if (parallel) {
            await Promise.all(targets.map(dispatchOne))
          } else {
            for (const target of targets) await dispatchOne(target)
          }
        })
        .catch((err) => console.error('[dispatch] getDispatchTargets failed:', err))

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      systemContent = `Gate blocked: ${message}`
    }

    const { data: stored, error: insertError } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        author_type: 'system',
        author_id: botRole.id,
        content: systemContent!,
        ...(parentMessageId ? { parent_id: parentMessageId } : {}),
      })
      .select('id')
      .single()

    if (insertError || !stored) {
      throw new Error(`Failed to store system message: ${insertError?.message ?? 'no data'}`)
    }

    return stored.id
  }

  // 4a-ii. Handle propose_github_action tool
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
