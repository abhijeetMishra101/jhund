import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PUT } from '@/app/api/features/[id]/stage/route'

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'workspace-uuid'
const FEATURE_ID = 'feature-uuid'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

function makeReq(body: unknown) {
  return new Request(`http://localhost/api/features/${FEATURE_ID}/stage`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(id = FEATURE_ID) {
  return { params: Promise.resolve({ id }) }
}

/**
 * Setup the mock chain for a stage advance call.
 * The route calls:
 *   1. users -> get workspace_id
 *   2. features -> get feature (anti-IDOR check + stage)
 *   3. checkGate -> gates.ts calls: features (status/blocking_reason/stage), then feature_use_cases
 *   4. advanceStage -> features (get stage), then features update, then gate_events insert
 */
function setupAuthAndFeature(featureStage = 1) {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  mockServiceFrom.mockReset()

  // 1. users query (route auth)
  mockServiceFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
  })

  // 2. features anti-IDOR query
  mockServiceFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { id: FEATURE_ID, stage: featureStage },
      error: null,
    }),
  })
}

describe('PUT /api/features/[id]/stage — auth & validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PUT(makeReq({ to_stage: 2, gate_type: 'founder_approval' }), makeParams())
    expect(res.status).toBe(401)
  })

  it('returns 400 when body is invalid JSON', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const badReq = new Request(`http://localhost/api/features/${FEATURE_ID}/stage`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    })
    const res = await PUT(badReq, makeParams())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON')
  })

  it('returns 400 when to_stage is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(makeReq({ gate_type: 'founder_approval' }), makeParams())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('to_stage')
  })

  it('returns 400 when gate_type is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(makeReq({ to_stage: 2 }), makeParams())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('gate_type')
  })

  it('returns 404 when user row not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReset()
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    const res = await PUT(makeReq({ to_stage: 2, gate_type: 'founder_approval' }), makeParams())
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('User not found')
  })

  it('returns 404 when feature not found (anti-IDOR)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReset()
    // users query succeeds
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
    })
    // features anti-IDOR — not found
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    })
    const res = await PUT(makeReq({ to_stage: 2, gate_type: 'founder_approval' }), makeParams())
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Feature not found')
  })
})

describe('PUT /api/features/[id]/stage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 409 when stage 1→2 and no use cases exist', async () => {
    setupAuthAndFeature(1)

    // checkGate: features query (status check)
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { status: 'active', blocking_reason: null, stage: 1 },
        error: null,
      }),
    })
    // checkGate: feature_use_cases count — 0
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
    })

    const res = await PUT(makeReq({ to_stage: 2, gate_type: 'founder_approval' }), makeParams())
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.gate_blocked).toBe(true)
    expect(json.error).toContain('No use cases defined')
  })

  it('returns 200 when stage 1→2 and use cases exist', async () => {
    setupAuthAndFeature(1)

    // checkGate: features query
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { status: 'active', blocking_reason: null, stage: 1 },
        error: null,
      }),
    })
    // checkGate: feature_use_cases count — 2
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
    })
    // advanceStage: features get current stage
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { stage: 1 }, error: null }),
    })
    // advanceStage: checkGate again (called inside advanceStage)
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { status: 'active', blocking_reason: null, stage: 1 },
        error: null,
      }),
    })
    // advanceStage inner checkGate: use cases
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
    })
    // advanceStage: features update
    mockServiceFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    // advanceStage: gate_events insert
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    const res = await PUT(makeReq({ to_stage: 2, gate_type: 'founder_approval' }), makeParams())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.stage).toBe(2)
  })

  it('returns 409 when stage 6→7 and unverified use cases exist', async () => {
    setupAuthAndFeature(6)

    // checkGate: features query
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { status: 'active', blocking_reason: null, stage: 6 },
        error: null,
      }),
    })
    // checkGate: feature_use_cases with verified_at IS NULL AND waived_at IS NULL — 2 found
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
    })
    // We need to chain properly: eq().is().is()
    const isChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
    }
    // Final .is() returns the data
    const finalIs = vi.fn().mockResolvedValue({ data: [{ id: 'uc-1' }, { id: 'uc-2' }], error: null })
    isChain.is.mockReturnValueOnce({ is: finalIs }).mockReturnValue({ is: finalIs })

    mockServiceFrom.mockReset()
    // Re-setup with proper chain
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom
      // users
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
      })
      // features anti-IDOR
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: FEATURE_ID, stage: 6 }, error: null }),
      })
      // checkGate: features status
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { status: 'active', blocking_reason: null, stage: 6 }, error: null }),
      })
      // checkGate: feature_use_cases unverified — returns 2 unverified
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        // chained second .is()
      })

    // Need a better approach - mock the full chain properly
    // Reset and do it cleanly
    mockServiceFrom.mockReset()
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const ucQueryMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn(),
    }
    // First .is() returns object with second .is()
    const secondIs = vi.fn().mockResolvedValue({ data: [{ id: 'uc-1' }, { id: 'uc-2' }], error: null })
    ucQueryMock.is.mockReturnValue({ is: secondIs })

    mockServiceFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: FEATURE_ID, stage: 6 }, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { status: 'active', blocking_reason: null, stage: 6 }, error: null }),
      })
      .mockReturnValueOnce(ucQueryMock)

    const res = await PUT(makeReq({ to_stage: 7, gate_type: 'bot_signoff', actor_role: 'qa' }), makeParams())
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.gate_blocked).toBe(true)
    expect(json.error).toContain('use case(s) not yet verified')
  })

  it('returns 409 when stage 6→7 and waived_at IS NULL even if waive_reason set', async () => {
    // Same as above — waived_at IS NULL means not waived, even with waive_reason
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReset()

    const ucQueryMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn(),
    }
    const secondIs = vi.fn().mockResolvedValue({
      data: [{ id: 'uc-1', waive_reason: 'some reason but not waived_at' }],
      error: null,
    })
    ucQueryMock.is.mockReturnValue({ is: secondIs })

    mockServiceFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: FEATURE_ID, stage: 6 }, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { status: 'active', blocking_reason: null, stage: 6 }, error: null }),
      })
      .mockReturnValueOnce(ucQueryMock)

    const res = await PUT(makeReq({ to_stage: 7, gate_type: 'bot_signoff', actor_role: 'qa' }), makeParams())
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.gate_blocked).toBe(true)
  })

  it('returns 200 when stage 6→7 and all use cases verified', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReset()

    const ucQueryMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn(),
    }
    // No unverified use cases
    const secondIs = vi.fn().mockResolvedValue({ data: [], error: null })
    ucQueryMock.is.mockReturnValue({ is: secondIs })

    mockServiceFrom
      // users
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
      })
      // features anti-IDOR
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: FEATURE_ID, stage: 6 }, error: null }),
      })
      // checkGate: features status
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { status: 'active', blocking_reason: null, stage: 6 }, error: null }),
      })
      // checkGate: unverified use cases — 0
      .mockReturnValueOnce(ucQueryMock)
      // advanceStage: features get current stage
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { stage: 6 }, error: null }),
      })
      // advanceStage inner checkGate: features status
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { status: 'active', blocking_reason: null, stage: 6 }, error: null }),
      })
      // advanceStage inner checkGate: unverified use cases — 0
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnValue({ is: vi.fn().mockResolvedValue({ data: [], error: null }) }),
      })
      // advanceStage: features update (stage=7, status=shipped)
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      // advanceStage: gate_events insert
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })

    const res = await PUT(makeReq({ to_stage: 7, gate_type: 'bot_signoff', actor_role: 'qa' }), makeParams())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.stage).toBe(7)
  })

  it('returns 409 when feature is blocked (any stage)', async () => {
    setupAuthAndFeature(3)

    // checkGate: features status — blocked
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { status: 'blocked', blocking_reason: 'Major design issue', stage: 3 },
        error: null,
      }),
    })

    const res = await PUT(makeReq({ to_stage: 4, gate_type: 'bot_signoff' }), makeParams())
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.gate_blocked).toBe(true)
    expect(json.error).toContain('Feature is blocked')
  })
})
