import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { buildMessageHistory } from './context'
import type { BotRole } from '@/lib/supabase/types'

export class ActionCapExceededError extends Error {
  constructor() {
    super('ACTION_CAP_EXCEEDED')
    this.name = 'ActionCapExceededError'
  }
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Tool definition for proposing GitHub actions — injected into every Claude call
const PROPOSE_GITHUB_ACTION_TOOL: Anthropic.Tool = {
  name: 'propose_github_action',
  description:
    'Use this when you want to create a PR, open an issue, or comment on GitHub. ' +
    'Never take GitHub actions directly — always use this tool and wait for founder approval.',
  input_schema: {
    type: 'object' as const,
    properties: {
      action_type: {
        type: 'string',
        enum: ['create_pr', 'create_issue', 'comment_pr', 'comment_issue'],
        description: 'The type of GitHub action to perform',
      },
      plain_english_description: {
        type: 'string',
        description: 'Plain English description of what will happen, shown to the founder for approval',
      },
      payload: {
        type: 'object',
        description: 'Action-specific fields (title, body, branch name, etc.)',
      },
    },
    required: ['action_type', 'plain_english_description', 'payload'],
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
 * Generates a bot reply for the given channel and stores it as a message row.
 *
 * Flow:
 *   1. Fetch bot_role for channel
 *   2. Atomically increment action counter — throw ActionCapExceededError if exhausted
 *   3. Build message history (last 20 turns)
 *   4. Call Claude with cached system prompt + propose_github_action tool
 *   5a. If Claude used the tool: create a plans row (status=pending), store message with plan_id
 *   5b. Otherwise: store plain text reply
 *   6. Return stored message id
 */
export async function respondToMessage(
  channelId: string,
  workspaceId: string
): Promise<string> {
  const supabase = createServiceClient()

  // 1. Get bot role
  const botRole = await getBotForChannel(channelId)
  if (!botRole) throw new Error(`No bot configured for channel ${channelId}`)

  // 2. Enforce action cap atomically
  const { data: allowed, error: capError } = await supabase.rpc('increment_action_count', {
    p_workspace_id: workspaceId,
  })

  if (capError) throw new Error(`Action cap check failed: ${capError.message}`)
  if (!allowed) throw new ActionCapExceededError()

  // 3. Build conversation history
  const messageHistory = await buildMessageHistory(channelId, 20)

  if (messageHistory.length === 0) {
    throw new Error('No messages to respond to')
  }

  // 4. Call Claude with cached system prompt + plan-gate tool
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

  // 5a. Check if Claude proposed a GitHub action via tool use
  const toolUseBlock = response.content.find((b) => b.type === 'tool_use') as
    | Anthropic.ToolUseBlock
    | undefined

  if (toolUseBlock) {
    const input = toolUseBlock.input as {
      action_type: string
      plain_english_description: string
      payload: Record<string, unknown>
    }

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

    // Create the plan row first
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .insert({
        channel_id: channelId,
        bot_role_id: botRole.id,
        description_md: displayDescription,
        github_actions: [
          {
            action_type: input.action_type,
            payload: input.payload as Record<string, string | number | boolean | null>,
          },
        ] as unknown as import('@/lib/supabase/types').Json,
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
      })
      .select('id')
      .single()

    if (insertError || !stored) {
      throw new Error(`Failed to store bot reply: ${insertError?.message ?? 'no data'}`)
    }

    return stored.id
  }

  // 5b. Plain text reply — no GitHub action proposed
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
    })
    .select('id')
    .single()

  if (insertError || !stored) {
    throw new Error(`Failed to store bot reply: ${insertError?.message ?? 'no data'}`)
  }

  return stored.id
}
