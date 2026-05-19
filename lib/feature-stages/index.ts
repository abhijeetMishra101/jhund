import { createServiceClient } from '@/lib/supabase/server'
import { checkGate as checkGateImpl } from './gates'
import type { GateResult, GateType } from './types'

export { checkGate } from './gates'
export type { GateResult, GateType, Complexity, FeatureStatus } from './types'

/**
 * Advance a feature to the next stage.
 * Validates the gate first — throws if not cleared.
 * Writes the new stage and a gate_events row.
 */
export async function advanceStage(
  featureId: string,
  toStage: number,
  gateType: GateType,
  actorRole?: string,
  notes?: string
): Promise<void> {
  const db = createServiceClient()

  // 1. Fetch current stage to know fromStage
  const { data: feature, error: fetchError } = await db
    .from('features')
    .select('stage')
    .eq('id', featureId)
    .single()

  if (fetchError || !feature) {
    throw new Error('Feature not found')
  }

  const fromStage = feature.stage as number

  // 2. Validate gate
  const gateResult: GateResult = await checkGateImpl(featureId, fromStage)
  if (!gateResult.cleared) {
    throw new Error(gateResult.reason)
  }

  // 3. Update feature stage
  const updatePayload: {
    stage: number
    updated_at: string
    status?: 'active' | 'blocked' | 'shipped' | 'cancelled'
  } = {
    stage: toStage,
    updated_at: new Date().toISOString(),
  }
  if (toStage === 7) {
    updatePayload.status = 'shipped'
  }

  const { error: updateError } = await db
    .from('features')
    .update(updatePayload)
    .eq('id', featureId)

  if (updateError) {
    throw new Error(`Failed to update feature stage: ${updateError.message}`)
  }

  // 4. Insert gate_events row
  const { error: gateEventError } = await db
    .from('gate_events')
    .insert({
      feature_id: featureId,
      from_stage: fromStage,
      to_stage: toStage,
      gate_type: gateType,
      actor_role: actorRole ?? null,
      notes: notes ?? null,
    })

  if (gateEventError) {
    throw new Error(`Failed to record gate event: ${gateEventError.message}`)
  }
}

/**
 * Block a feature, setting status=blocked and storing the blocking reason.
 * Records a gate_events row with the current stage as both from and to.
 */
export async function blockFeature(
  featureId: string,
  reason: string,
  actorRole?: string
): Promise<void> {
  const db = createServiceClient()

  // Fetch current stage
  const { data: feature, error: fetchError } = await db
    .from('features')
    .select('stage')
    .eq('id', featureId)
    .single()

  if (fetchError || !feature) {
    throw new Error('Feature not found')
  }

  const currentStage = feature.stage as number

  // Update feature to blocked
  const { error: updateError } = await db
    .from('features')
    .update({
      status: 'blocked',
      blocking_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', featureId)

  if (updateError) {
    throw new Error(`Failed to block feature: ${updateError.message}`)
  }

  // Record gate event
  const { error: gateEventError } = await db
    .from('gate_events')
    .insert({
      feature_id: featureId,
      from_stage: currentStage,
      to_stage: currentStage,
      gate_type: 'bot_signoff' as GateType,
      actor_role: actorRole ?? null,
      notes: reason,
    })

  if (gateEventError) {
    throw new Error(`Failed to record gate event: ${gateEventError.message}`)
  }
}
