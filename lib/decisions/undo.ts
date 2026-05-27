/**
 * Retracts the most recent non-deleted decision in a given workspace+channel.
 * Sets deleted_at on the decision_events row (soft-delete) and posts a
 * withdrawn notice to #decisions so the audit trail shows the retraction.
 *
 * This module has NO dependency on lib/bots — the caller (lib/bots/index.ts)
 * owns the confirmation message posted back to the source channel.
 */
import { createServiceClient } from '@/lib/supabase/server'

export type UndoDecisionResult =
  | { undone: false }
  | { undone: true; title: string; actionWasDispatched: boolean }

/**
 * Soft-deletes the most recent non-deleted decision for this workspace+channel
 * and posts a withdrawn notice to #decisions.
 *
 * Returns { undone: false } when no eligible decision is found.
 */
export async function undoDecision(
  workspaceId: string,
  channelId: string,
  botRoleId: string
): Promise<UndoDecisionResult> {
  const supabase = createServiceClient()

  // 1. Find the most recent non-deleted decision for this channel
  const { data: decision } = await supabase
    .from('decision_events')
    .select('id, title, action_dispatched_at')
    .eq('workspace_id', workspaceId)
    .eq('channel_id', channelId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!decision) return { undone: false }

  // 2. Soft-delete — cast because deleted_at is added by migration 008
  //    and the generated Supabase types predate it.
  await supabase
    .from('decision_events')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ deleted_at: new Date().toISOString() } as any)
    .eq('id', decision.id)

  // 3. Post withdrawn notice to #decisions (fire-and-forget)
  void (async () => {
    try {
      const { data: decisionsChannel } = await supabase
        .from('channels')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('name', 'decisions')
        .single()

      if (!decisionsChannel) return

      await supabase.from('messages').insert({
        channel_id: decisionsChannel.id,
        author_type: 'bot' as const,
        author_id: botRoleId,
        content: `↩️ Decision "${decision.title}" was withdrawn`,
      })
    } catch (err) {
      console.error('[undo] failed to post withdrawn notice to #decisions:', err)
    }
  })()

  return {
    undone: true,
    title: decision.title,
    actionWasDispatched: decision.action_dispatched_at !== null,
  }
}
