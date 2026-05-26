/**
 * Posts a decision action message to the #decisions channel and returns the
 * channel + message IDs so the caller (lib/bots/index.ts) can trigger
 * respondToMessage without creating a circular import.
 *
 * This module has NO dependency on lib/bots.
 */
import { createServiceClient } from '@/lib/supabase/server'

export interface PostDecisionMessageResult {
  decisionsChannelId: string
  messageId: string
}

/**
 * Finds the workspace's #decisions channel, posts the action message there,
 * and returns the IDs needed for the caller to dispatch bot response.
 *
 * Returns null if no #decisions channel exists in this workspace.
 */
export async function postDecisionMessage(
  workspaceId: string,
  action: string,
  decidingBotRoleId: string
): Promise<PostDecisionMessageResult | null> {
  const supabase = createServiceClient()

  // Find the #decisions channel for this workspace
  const { data: decisionsChannel } = await supabase
    .from('channels')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', 'decisions')
    .single()

  if (!decisionsChannel) {
    return null
  }

  // Fetch the deciding bot's display name for the message
  const { data: botRole } = await supabase
    .from('bot_roles')
    .select('display_name')
    .eq('id', decidingBotRoleId)
    .single()

  const botName = botRole?.display_name ?? 'A bot'
  const messageContent = `${botName} decided: ${action}`

  // Post the action message to #decisions authored by the deciding bot
  const { data: message, error: messageError } = await supabase
    .from('messages')
    .insert({
      channel_id: decisionsChannel.id,
      author_type: 'bot' as const,
      author_id: decidingBotRoleId,
      content: messageContent,
    })
    .select('id')
    .single()

  if (messageError || !message) {
    throw new Error(`Failed to post decision message: ${messageError?.message ?? 'no data'}`)
  }

  return {
    decisionsChannelId: decisionsChannel.id,
    messageId: message.id,
  }
}

/**
 * Posts a plain summary of any decision (with or without action) to #decisions
 * so the channel always reflects every recorded decision, not just actioned ones.
 *
 * Returns null if no #decisions channel exists.
 */
export async function postDecisionSummary(
  workspaceId: string,
  sourceChannelId: string,
  title: string,
  summary: string,
  decidingBotRoleId: string
): Promise<void> {
  const supabase = createServiceClient()

  const { data: decisionsChannel } = await supabase
    .from('channels')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', 'decisions')
    .single()

  if (!decisionsChannel) return

  // Look up source channel name so we can show "from #product" etc.
  const { data: sourceChannel } = await supabase
    .from('channels')
    .select('name')
    .eq('id', sourceChannelId)
    .single()

  const source = sourceChannel?.name ? ` (from #${sourceChannel.name})` : ''
  const content = `📋 **${title}**${source}\n\n${summary}`

  await supabase.from('messages').insert({
    channel_id: decisionsChannel.id,
    author_type: 'bot' as const,
    author_id: decidingBotRoleId,
    content,
  })
}

/**
 * Updates the action_dispatched_at timestamp on a decision_events row.
 */
export async function markDecisionDispatched(decisionId: string): Promise<void> {
  const supabase = createServiceClient()

  await supabase
    .from('decision_events')
    .update({ action_dispatched_at: new Date().toISOString() })
    .eq('id', decisionId)
}
