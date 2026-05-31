/**
 * Bot-to-bot messaging — allows one bot to send a message to another bot's
 * channel and receive the reply inline as a string.
 *
 * The circular dependency between this module and lib/bots/index.ts is resolved
 * with a dynamic import inside messageTeammate. Do NOT add a top-level import of
 * lib/bots/index here.
 */
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Sends a message from one bot to another bot's primary channel in the workspace,
 * waits for the target bot to reply, and returns the reply text.
 *
 * @param callingBotId    - The UUID of the bot sending the message
 * @param callingBotName  - The display name of the bot sending the message (used as author label)
 * @param targetRole      - The role_key of the bot to message (e.g. 'backend', 'design')
 * @param message         - The message content to send
 * @param workspaceId     - The workspace in which to find the target channel
 * @returns The reply text produced by the target bot
 */
export async function messageTeammate(
  callingBotId: string,
  callingBotName: string,
  targetRole: string,
  message: string,
  workspaceId: string
): Promise<string> {
  const supabase = createServiceClient()

  // Find any channel for the target role in this workspace.
  // Prefer is_primary=true membership but fall back to any membership so that
  // channels created without explicit primary flags still work.
  const { data: memberRows } = await supabase
    .from('channel_members')
    .select('channel_id, is_primary, bot_roles!inner(role_key), channels!inner(workspace_id, channel_type)')
    .eq('channels.workspace_id', workspaceId)
    .eq('channels.channel_type', 'channel')
    .eq('bot_roles.role_key', targetRole)

  if (!memberRows || memberRows.length === 0) {
    throw new Error(`No ${targetRole} channel found in this workspace`)
  }

  // Prefer the primary membership; fall back to first available
  const preferred = memberRows.find((r) => r.is_primary) ?? memberRows[0]

  const targetChannelId = preferred.channel_id

  // Post the calling bot's message into the target channel
  const { data: postedMessage, error: postError } = await supabase
    .from('messages')
    .insert({
      channel_id: targetChannelId,
      author_type: 'bot',
      author_id: callingBotId,
      content: `**${callingBotName}:** ${message}`,
    })
    .select('id')
    .single()

  if (postError || !postedMessage) {
    throw new Error(`Failed to post message to ${targetRole} channel: ${postError?.message ?? 'no data'}`)
  }

  // Dynamic import to avoid circular dependency with lib/bots/index.ts
  const { respondToMessage } = await import('@/lib/bots/index')

  // Call the target bot — isBotToBotCall=true prevents recursive message_teammate calls
  const replyMessageId = await respondToMessage(targetChannelId, workspaceId, undefined, message, true)

  // Fetch the reply content
  const { data: replyRow, error: fetchError } = await supabase
    .from('messages')
    .select('content')
    .eq('id', replyMessageId)
    .single()

  if (fetchError || !replyRow) {
    throw new Error(`Failed to fetch reply from ${targetRole}: ${fetchError?.message ?? 'no data'}`)
  }

  return replyRow.content
}
