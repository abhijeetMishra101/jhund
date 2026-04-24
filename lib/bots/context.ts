import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Fetches the last `limit` messages from a channel and maps them to
 * Anthropic MessageParam format, ordered oldest→newest (required by Claude).
 *
 * author_type='user' → role:'user'
 * author_type='bot'  → role:'assistant'
 * author_type='system' → skipped (system messages are not conversation turns)
 */
export async function buildMessageHistory(
  channelId: string,
  limit = 20
): Promise<MessageParam[]> {
  const supabase = createServiceClient()

  const { data: messages, error } = await supabase
    .from('messages')
    .select('author_type, content')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to fetch message history: ${error.message}`)

  // Reverse to oldest-first. System messages (e.g. GitHub events) are
  // mapped to 'user' role so the bot has context about what triggered it.
  const turns = (messages ?? [])
    .reverse()
    .filter((m) => m.author_type === 'user' || m.author_type === 'bot' || m.author_type === 'system')

  // Anthropic requires alternating user/assistant — collapse consecutive same-role messages
  const params: MessageParam[] = []
  for (const msg of turns) {
    const role = msg.author_type === 'bot' ? 'assistant' : 'user'
    const last = params[params.length - 1]
    if (last && last.role === role) {
      // Merge with previous same-role turn (rare edge case)
      last.content = `${last.content}\n\n${msg.content}`
    } else {
      params.push({ role, content: msg.content })
    }
  }

  // Claude requires conversation to start with 'user' — drop leading assistant turns
  while (params.length > 0 && params[0].role === 'assistant') {
    params.shift()
  }

  return params
}
