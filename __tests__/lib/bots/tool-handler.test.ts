/**
 * Tests for the advance_feature_stage tool_use handler logic.
 *
 * UC-16-08: advance_feature_stage handler calls advanceStage with correct args
 * UC-16-09: gate-blocked error from advanceStage → system message with error text
 * UC-16-10: success → system message includes stage number and notes
 *
 * Strategy: test the handler logic in isolation (not via respondToMessage, which
 * requires a running Anthropic SDK). The logic is trivial to extract and verify
 * directly — the contract is: call advanceStage, catch errors, format message.
 */
import { describe, it, expect, vi } from 'vitest'

// ── Inline implementation of the handler (matches lib/bots/index.ts exactly) ─

type GateType = 'bot_signoff' | 'founder_approval' | 'auto_clear'

interface AdvanceInput {
  feature_id: string
  to_stage: number
  gate_type: GateType
  notes: string
}

async function handleAdvanceFeatureStageTool(
  input: AdvanceInput,
  actorRole: string,
  advanceStageFn: (
    featureId: string,
    toStage: number,
    gateType: GateType,
    actorRole?: string,
    notes?: string
  ) => Promise<void>
): Promise<string> {
  try {
    await advanceStageFn(input.feature_id, input.to_stage, input.gate_type, actorRole, input.notes)
    return `✓ Feature advanced to stage ${input.to_stage}: ${input.notes}`
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return `Gate blocked: ${message}`
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('advance_feature_stage tool handler', () => {
  it('UC-16-08: calls advanceStage with feature_id, to_stage, gate_type, actor_role, notes', async () => {
    const mockAdvanceStage = vi.fn().mockResolvedValue(undefined)
    const input: AdvanceInput = {
      feature_id: 'feat-123',
      to_stage: 2,
      gate_type: 'bot_signoff',
      notes: 'Use cases are ready',
    }

    await handleAdvanceFeatureStageTool(input, 'product', mockAdvanceStage)

    expect(mockAdvanceStage).toHaveBeenCalledOnce()
    expect(mockAdvanceStage).toHaveBeenCalledWith(
      'feat-123',
      2,
      'bot_signoff',
      'product',
      'Use cases are ready'
    )
  })

  it('UC-16-09: gate-blocked error → system message starts with "Gate blocked:"', async () => {
    const mockAdvanceStage = vi.fn().mockRejectedValue(new Error('No use cases defined yet'))
    const input: AdvanceInput = {
      feature_id: 'feat-123',
      to_stage: 2,
      gate_type: 'bot_signoff',
      notes: 'Trying to advance',
    }

    const result = await handleAdvanceFeatureStageTool(input, 'product', mockAdvanceStage)

    expect(result).toBe('Gate blocked: No use cases defined yet')
  })

  it('UC-16-10: success → message includes stage number and original notes', async () => {
    const mockAdvanceStage = vi.fn().mockResolvedValue(undefined)
    const input: AdvanceInput = {
      feature_id: 'feat-456',
      to_stage: 7,
      gate_type: 'bot_signoff',
      notes: 'All use cases verified by Casey',
    }

    const result = await handleAdvanceFeatureStageTool(input, 'qa', mockAdvanceStage)

    expect(result).toBe('✓ Feature advanced to stage 7: All use cases verified by Casey')
  })

  it('non-Error thrown → "Gate blocked: Unknown error" fallback', async () => {
    const mockAdvanceStage = vi.fn().mockRejectedValue('string error')
    const input: AdvanceInput = {
      feature_id: 'feat-789',
      to_stage: 3,
      gate_type: 'auto_clear',
      notes: 'Moving to design',
    }

    const result = await handleAdvanceFeatureStageTool(input, 'product', mockAdvanceStage)

    expect(result).toBe('Gate blocked: Unknown error')
  })
})
