import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/features/[id]/route'

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'workspace-uuid'
const FEATURE_ID = 'feature-uuid'
const OTHER_FEATURE_ID = 'other-feature-uuid'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/features/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns feature + use_cases + gate_history', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReset()

    const mockFeature = {
      id: FEATURE_ID,
      workspace_id: WORKSPACE_ID,
      title: 'Auth revamp',
      stage: 3,
      status: 'active',
      complexity: 'medium',
      blocking_reason: null,
      pr_url: null,
      description: 'Revamp auth flow',
      created_at: '2026-05-20T00:00:00Z',
      updated_at: '2026-05-20T00:00:00Z',
    }
    const mockUseCases = [{ id: 'uc-1', feature_id: FEATURE_ID, uc_id: 'UC-1-01', description: 'Login with Google', verified_at: null, waived_at: null, waive_reason: null, created_at: '2026-05-20T00:00:00Z' }]
    const mockGateHistory = [{ id: 'ge-1', feature_id: FEATURE_ID, from_stage: 1, to_stage: 2, gate_type: 'founder_approval', actor_role: 'product', notes: null, created_at: '2026-05-20T00:00:00Z' }]

    mockServiceFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockFeature, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockUseCases, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockGateHistory, error: null }),
      })

    const res = await GET(new Request('http://localhost/api/features/' + FEATURE_ID), makeParams(FEATURE_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.feature.id).toBe(FEATURE_ID)
    expect(json.use_cases).toHaveLength(1)
    expect(json.gate_history).toHaveLength(1)
  })

  it('returns 404 for feature in another workspace (anti-IDOR)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReset()

    mockServiceFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      })

    const res = await GET(new Request('http://localhost/api/features/' + OTHER_FEATURE_ID), makeParams(OTHER_FEATURE_ID))
    expect(res.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(new Request('http://localhost/api/features/' + FEATURE_ID), makeParams(FEATURE_ID))
    expect(res.status).toBe(401)
  })
})
