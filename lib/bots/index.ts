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
 *   4. Call Claude with cached system prompt
 *   5. Store bot response in messages table
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

  // If the conversation is empty (shouldn't happen, but guard it)
  if (messageHistory.length === 0) {
    throw new Error('No messages to respond to')
  }

  // 4. Call Claude with cached system prompt
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: botRole.system_prompt,
        // Prompt caching — amortises system prompt cost across all turns
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: messageHistory,
  })

  const replyText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('\n')
    .trim()

  if (!replyText) throw new Error('Claude returned an empty response')

  // 5. Store bot reply
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
