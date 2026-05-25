/**
 * Persists a decision made by a bot into the decision_events table.
 *
 * Deliberately has NO dependency on lib/bots to avoid circular imports.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { DecisionEvent } from '@/lib/supabase/types'

export interface RecordDecisionParams {
  workspaceId: string
  channelId: string
  botRoleId: string
  title: string
  summary: string
  action?: string
}

/**
 * Inserts a new decision_events row and returns the created row.
 */
export async function recordDecision(params: RecordDecisionParams): Promise<DecisionEvent> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('decision_events')
    .insert({
      workspace_id: params.workspaceId,
      channel_id: params.channelId,
      bot_role_id: params.botRoleId,
      title: params.title,
      summary: params.summary,
      action: params.action ?? null,
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(`Failed to record decision: ${error?.message ?? 'no data'}`)
  }

  return data
}
