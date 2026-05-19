import { createServiceClient } from '@/lib/supabase/server'
import type { GateResult } from './types'

export async function checkGate(featureId: string, fromStage: number): Promise<GateResult> {
  const db = createServiceClient()

  // Fetch the feature to check status
  const { data: feature, error: featureError } = await db
    .from('features')
    .select('status, blocking_reason, stage')
    .eq('id', featureId)
    .single()

  if (featureError || !feature) {
    return { cleared: false, reason: 'Feature not found', requiresFounder: false }
  }

  if (feature.status === 'blocked') {
    return {
      cleared: false,
      reason: `Feature is blocked: ${feature.blocking_reason ?? 'no reason provided'}`,
      requiresFounder: true,
    }
  }

  // Stage 1 → 2: must have at least one use case
  if (fromStage === 1) {
    const { count, error } = await db
      .from('feature_use_cases')
      .select('id', { count: 'exact', head: true })
      .eq('feature_id', featureId)

    if (error) {
      return { cleared: false, reason: 'Failed to query use cases', requiresFounder: false }
    }

    if (!count || count === 0) {
      return {
        cleared: false,
        reason:
          'No use cases defined yet. Alex needs to add use cases before this feature can move to Requirements.',
        requiresFounder: false,
      }
    }

    return { cleared: true }
  }

  // Stage 6 → 7: all use cases must be verified or waived
  if (fromStage === 6) {
    const { data: unverified, error } = await db
      .from('feature_use_cases')
      .select('id')
      .eq('feature_id', featureId)
      .is('verified_at', null)
      .is('waived_at', null)

    if (error) {
      return { cleared: false, reason: 'Failed to query use case verification status', requiresFounder: false }
    }

    const unverifiedCount = unverified?.length ?? 0
    if (unverifiedCount > 0) {
      return {
        cleared: false,
        reason: `${unverifiedCount} use case(s) not yet verified by Casey. All must be verified or waived before shipping.`,
        requiresFounder: false,
      }
    }

    return { cleared: true }
  }

  // All other stage transitions are allowed in Phase 16A
  return { cleared: true }
}
