import { describe, it, expect, vi, beforeEach } from 'vitest'
import { advanceStage, blockFeature, checkGate } from '@/lib/feature-stages'

const FEATURE_ID = 'feature-uuid'

const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: vi.fn() } }),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

describe('checkGate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stage 6→7 with all verified → cleared: true', async () => {
    mockServiceFrom.mockReset()

    // features status
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { status: 'active', blocking_reason: null, stage: 6 },
        error: null,
      }),
    })
    // unverified use cases — 0
    const secondIs = vi.fn().mockResolvedValue({ data: [], error: null })
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnValue({ is: secondIs }),
    })

    const result = await checkGate(FEATURE_ID, 6)
    expect(result.cleared).toBe(true)
  })

  it('stage 6→7 with 1 unverified → cleared: false', async () => {
    mockServiceFrom.mockReset()

    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { status: 'active', blocking_reason: null, stage: 6 },
        error: null,
      }),
    })
    const secondIs = vi.fn().mockResolvedValue({ data: [{ id: 'uc-1' }], error: null })
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnValue({ is: secondIs }),
    })

    const result = await checkGate(FEATURE_ID, 6)
    expect(result.cleared).toBe(false)
    if (!result.cleared) {
      expect(result.reason).toContain('1 use case(s) not yet verified')
      expect(result.requiresFounder).toBe(false)
    }
  })

  it('blocked feature returns cleared: false with requiresFounder: true', async () => {
    mockServiceFrom.mockReset()

    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { status: 'blocked', blocking_reason: 'Major issue', stage: 3 },
        error: null,
      }),
    })

    const result = await checkGate(FEATURE_ID, 3)
    expect(result.cleared).toBe(false)
    if (!result.cleared) {
      expect(result.requiresFounder).toBe(true)
      expect(result.reason).toContain('Feature is blocked')
    }
  })

  it('stage 1→2 with no use cases → cleared: false', async () => {
    mockServiceFrom.mockReset()

    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { status: 'active', blocking_reason: null, stage: 1 },
        error: null,
      }),
    })
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
    })

    const result = await checkGate(FEATURE_ID, 1)
    expect(result.cleared).toBe(false)
    if (!result.cleared) {
      expect(result.reason).toContain('No use cases defined')
    }
  })

  it('stage 1→2 with use cases → cleared: true', async () => {
    mockServiceFrom.mockReset()

    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { status: 'active', blocking_reason: null, stage: 1 },
        error: null,
      }),
    })
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
    })

    const result = await checkGate(FEATURE_ID, 1)
    expect(result.cleared).toBe(true)
  })
})

describe('blockFeature', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets status=blocked and stores blocking_reason', async () => {
    mockServiceFrom.mockReset()

    // features get stage
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { stage: 3 }, error: null }),
    })
    // features update
    const updateFn = vi.fn().mockReturnThis()
    const eqFn = vi.fn().mockResolvedValue({ error: null })
    mockServiceFrom.mockReturnValueOnce({
      update: updateFn,
      eq: eqFn,
    })
    // gate_events insert
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    await expect(blockFeature(FEATURE_ID, 'Jordan flagged a major design issue', 'design')).resolves.not.toThrow()
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'blocked', blocking_reason: 'Jordan flagged a major design issue' })
    )
  })
})

describe('advanceStage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts gate_events row on advance', async () => {
    mockServiceFrom.mockReset()

    // advanceStage: get current stage
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { stage: 1 }, error: null }),
    })
    // inner checkGate: features status
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { status: 'active', blocking_reason: null, stage: 1 }, error: null }),
    })
    // inner checkGate: use cases count — has some
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
    })
    // features update
    mockServiceFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    // gate_events insert
    const insertFn = vi.fn().mockResolvedValue({ error: null })
    mockServiceFrom.mockReturnValueOnce({ insert: insertFn })

    await advanceStage(FEATURE_ID, 2, 'founder_approval', 'product', 'Use cases approved')

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        feature_id: FEATURE_ID,
        from_stage: 1,
        to_stage: 2,
        gate_type: 'founder_approval',
        actor_role: 'product',
        notes: 'Use cases approved',
      })
    )
  })

  it('sets status=shipped when toStage=7', async () => {
    mockServiceFrom.mockReset()

    // advanceStage: get current stage
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { stage: 6 }, error: null }),
    })
    // inner checkGate: features status
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { status: 'active', blocking_reason: null, stage: 6 }, error: null }),
    })
    // inner checkGate: unverified use cases — 0
    const secondIs = vi.fn().mockResolvedValue({ data: [], error: null })
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnValue({ is: secondIs }),
    })
    // features update
    const updateFn = vi.fn().mockReturnThis()
    const eqFn = vi.fn().mockResolvedValue({ error: null })
    mockServiceFrom.mockReturnValueOnce({ update: updateFn, eq: eqFn })
    // gate_events insert
    mockServiceFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })

    await advanceStage(FEATURE_ID, 7, 'bot_signoff', 'qa')

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 7, status: 'shipped' })
    )
  })

  it('throws when gate is not cleared', async () => {
    mockServiceFrom.mockReset()

    // advanceStage: get current stage
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { stage: 1 }, error: null }),
    })
    // inner checkGate: features status
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { status: 'active', blocking_reason: null, stage: 1 }, error: null }),
    })
    // inner checkGate: use cases count — 0
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
    })

    await expect(advanceStage(FEATURE_ID, 2, 'founder_approval')).rejects.toThrow(
      'No use cases defined'
    )
  })

  it('throws "Feature not found" when feature fetch fails', async () => {
    mockServiceFrom.mockReset()

    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    })

    await expect(advanceStage(FEATURE_ID, 2, 'founder_approval')).rejects.toThrow('Feature not found')
  })

  it('throws when feature update fails', async () => {
    mockServiceFrom.mockReset()

    // advanceStage: get current stage
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { stage: 1 }, error: null }),
    })
    // inner checkGate: features status
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { status: 'active', blocking_reason: null, stage: 1 }, error: null }),
    })
    // inner checkGate: use cases — has some
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
    })
    // update fails
    mockServiceFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: { message: 'DB write error' } }),
    })

    await expect(advanceStage(FEATURE_ID, 2, 'auto_clear')).rejects.toThrow('Failed to update feature stage')
  })

  it('throws when gate_events insert fails', async () => {
    mockServiceFrom.mockReset()

    // advanceStage: get current stage
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { stage: 1 }, error: null }),
    })
    // inner checkGate: features status
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { status: 'active', blocking_reason: null, stage: 1 }, error: null }),
    })
    // inner checkGate: use cases — has some
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
    })
    // update succeeds
    mockServiceFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    // gate_events insert fails
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: { message: 'insert failed' } }),
    })

    await expect(advanceStage(FEATURE_ID, 2, 'auto_clear')).rejects.toThrow('Failed to record gate event')
  })
})

describe('blockFeature — error paths', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws "Feature not found" when feature fetch fails', async () => {
    mockServiceFrom.mockReset()

    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    })

    await expect(blockFeature(FEATURE_ID, 'blocker')).rejects.toThrow('Feature not found')
  })

  it('throws when update fails', async () => {
    mockServiceFrom.mockReset()

    // feature fetch
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { stage: 3 }, error: null }),
    })
    // update fails
    mockServiceFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: { message: 'update error' } }),
    })

    await expect(blockFeature(FEATURE_ID, 'blocker')).rejects.toThrow('Failed to block feature')
  })

  it('throws when gate_events insert fails', async () => {
    mockServiceFrom.mockReset()

    // feature fetch
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { stage: 3 }, error: null }),
    })
    // update succeeds
    mockServiceFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    // gate_events insert fails
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: { message: 'insert failed' } }),
    })

    await expect(blockFeature(FEATURE_ID, 'blocker')).rejects.toThrow('Failed to record gate event')
  })
})

describe('checkGate — error paths', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns cleared:false when feature fetch fails', async () => {
    mockServiceFrom.mockReset()

    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    })

    const result = await checkGate(FEATURE_ID, 1)
    expect(result.cleared).toBe(false)
    if (!result.cleared) expect(result.reason).toBe('Feature not found')
  })

  it('returns cleared:false when use case count query fails (stage 1→2)', async () => {
    mockServiceFrom.mockReset()

    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { status: 'active', blocking_reason: null, stage: 1 },
        error: null,
      }),
    })
    // use case count query fails
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: null, error: { message: 'DB error' } }),
    })

    const result = await checkGate(FEATURE_ID, 1)
    expect(result.cleared).toBe(false)
    if (!result.cleared) expect(result.reason).toBe('Failed to query use cases')
  })

  it('returns cleared:false when unverified query fails (stage 6→7)', async () => {
    mockServiceFrom.mockReset()

    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { status: 'active', blocking_reason: null, stage: 6 },
        error: null,
      }),
    })
    // unverified query fails
    const secondIs = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnValue({ is: secondIs }),
    })

    const result = await checkGate(FEATURE_ID, 6)
    expect(result.cleared).toBe(false)
    if (!result.cleared) expect(result.reason).toBe('Failed to query use case verification status')
  })

  it('returns cleared:true for stages other than 1 and 6 (active feature)', async () => {
    mockServiceFrom.mockReset()

    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { status: 'active', blocking_reason: null, stage: 3 },
        error: null,
      }),
    })

    const result = await checkGate(FEATURE_ID, 3)
    expect(result.cleared).toBe(true)
  })
})
