/**
 * Stage handoff dispatch — finds which channels to notify when a feature
 * advances to a new stage and inserts the trigger message.
 *
 * Deliberately has NO dependency on lib/bots to avoid circular imports.
 * The caller (lib/bots/index.ts) is responsible for calling respondToMessage.
 */
import { createServiceClient } from '@/lib/supabase/server'

/** Role keys that own each stage, plus whether they fire in parallel. */
export const STAGE_DISPATCH: Record<number, { roles: string[]; parallel: boolean }> = {
  2: { roles: ['design', 'ml'], parallel: true },      // feasibility review — UX + ML simultaneously
  3: { roles: ['design'], parallel: false },            // full design
  4: { roles: ['backend', 'ml'], parallel: true },      // architecture — Engineering + ML notified
  5: { roles: ['backend'], parallel: false },           // build starts
  6: { roles: ['qa'], parallel: false },               // QA verification
  7: { roles: ['ops'], parallel: false },              // shipped announcement
}

/** Human-readable handoff message for each stage (feature title is interpolated). */
export function handoffMessage(featureTitle: string, toStage: number, context?: string): string {
  const messages: Record<number, string> = {
    2: `🔔 **${featureTitle}** has entered Requirements (Stage 2). Please run a feasibility review — reply Clear or Red Flag with your reasoning.`,
    3: `🔔 **${featureTitle}** cleared feasibility review. Design (Stage 3) is starting — please create the wireframes and spec.`,
    4: `🔔 **${featureTitle}** design is signed off. Architecture (Stage 4) is starting — please post your ADR and technical approach.`,
    5: `🔔 **${featureTitle}** architecture is approved. Build (Stage 5) is starting — please begin implementation.`,
    6: `🔔 **${featureTitle}** build is complete. QA (Stage 6) is starting — please verify all use cases.`,
    7: `🚀 **${featureTitle}** has shipped! Please announce to the team.`,
  }
  const base = messages[toStage] ?? `🔔 **${featureTitle}** has advanced to Stage ${toStage}.`
  if (context) {
    return `${base}\n\n**Handed off by the previous team:**\n${context}`
  }
  return base
}

export interface DispatchTarget {
  channelId: string
  parallel: boolean
}

/**
 * Finds the channel IDs for the bots that own the given stage in the workspace.
 * Returns an empty array if the stage has no configured owners or no matching channels.
 */
export async function getDispatchTargets(
  workspaceId: string,
  toStage: number
): Promise<DispatchTarget[]> {
  const config = STAGE_DISPATCH[toStage]
  if (!config || config.roles.length === 0) return []

  const db = createServiceClient()

  // Find channels where the primary bot has one of the target role_keys
  const { data: rows } = await db
    .from('channel_members')
    .select('channel_id, bot_roles!inner(role_key), channels!inner(workspace_id, channel_type)')
    .eq('channels.workspace_id', workspaceId)
    .eq('channels.channel_type', 'channel')
    .eq('is_primary', true)
    .in('bot_roles.role_key', config.roles)

  if (!rows || rows.length === 0) return []

  return rows.map((r) => ({
    channelId: r.channel_id,
    parallel: config.parallel,
  }))
}

/**
 * Posts a handoff system message to a channel, signalling to the bot
 * that a feature has advanced and their input is needed.
 * Returns the inserted message id.
 */
export async function postHandoffMessage(
  channelId: string,
  featureTitle: string,
  toStage: number,
  context?: string
): Promise<string> {
  const db = createServiceClient()

  const { data, error } = await db
    .from('messages')
    .insert({
      channel_id: channelId,
      author_type: 'system',
      author_id: '00000000-0000-0000-0000-000000000000',
      content: handoffMessage(featureTitle, toStage, context),
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to post handoff message: ${error?.message ?? 'no data'}`)
  }

  return data.id
}
