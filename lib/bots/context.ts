import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * The null UUID used as author_id for handoff and workflow-chain system messages.
 * These messages are "triggers" that should appear in Claude's context.
 */
const SYSTEM_TRIGGER_UUID = '00000000-0000-0000-0000-000000000000'

/**
 * Fetches the last `limit` messages from a channel and maps them to
 * Anthropic MessageParam format, ordered oldest→newest (required by Claude).
 *
 * author_type='user'   → role:'user'
 * author_type='bot'    → role:'assistant'
 * author_type='system' → role:'user' ONLY for trigger messages (GitHub events,
 *   handoffs, workflow chains). Confirmation chips and error messages are
 *   excluded so they don't corrupt Claude's context.
 *
 * Trigger system messages are identified by author_id:
 *   - workspaceId  → webhook events and workflow-chain transitions
 *   - SYSTEM_TRIGGER_UUID → feature-stage handoff messages
 *
 * @param workspaceId  The workspace the channel belongs to. Used to distinguish
 *                     trigger system messages from UI-only ones. When omitted all
 *                     system messages are included (backward-compatible fallback).
 */
export async function buildMessageHistory(
  channelId: string,
  limit = 20,
  workspaceId?: string
): Promise<MessageParam[]> {
  const supabase = createServiceClient()

  const { data: messages, error } = await supabase
    .from('messages')
    .select('author_type, author_id, content')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to fetch message history: ${error.message}`)

  // Reverse to oldest-first.
  // System messages are included ONLY when they are "trigger" messages (GitHub
  // events, feature handoffs, workflow-chain transitions) — identified by
  // author_id matching the workspace UUID or the SYSTEM_TRIGGER_UUID.
  // Confirmation chips ("✓ Decision recorded:"), error messages
  // ("Something went wrong"), and undo notifications use a bot_role UUID as
  // author_id and are excluded so they don't pollute Claude's context.
  const turns = (messages ?? [])
    .reverse()
    .filter((m) => {
      if (m.author_type === 'user' || m.author_type === 'bot') return true
      if (m.author_type === 'system') {
        if (!workspaceId) return true // backward-compat: include all if no workspaceId
        return m.author_id === workspaceId || m.author_id === SYSTEM_TRIGGER_UUID
      }
      return false
    })

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
