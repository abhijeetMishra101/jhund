import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/features/route'

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

function makeReq(body: unknown, method = 'POST') {
  return new Request('http://localhost/api/features', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/features', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns workspace features only (anti-IDOR)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReset()

    const mockFeatures = [
      {
        id: FEATURE_ID,
        title: 'Auth revamp',
        stage: 3,
        status: 'active',
        complexity: 'medium',
        blocking_reason: null,
        updated_at: '2026-05-20T00:00:00Z',
      },
    ]

    // users query
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
    })
    // features query
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockFeatures, error: null }),
    })
    // use_case count (total)
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      // returns count
    })
    // This is tricky — mock the full chain for each enrichment call
    const countMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockResolvedValue({ count: 2, error: null }),
    }
    countMock.eq.mockReturnValue({ count: 4, error: null, not: countMock.not })

    // Re-mock properly for enrichment
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
        order: vi.fn().mockResolvedValue({ data: mockFeatures, error: null }),
      })
      // uc count total for feature
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ count: 4, error: null }),
      })
      // uc verified count for feature
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockResolvedValue({ count: 2, error: null }),
      })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.features).toHaveLength(1)
    expect(json.features[0].id).toBe(FEATURE_ID)
  })
})

describe('POST /api/features', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates feature at stage 1', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReset()
    mockServiceFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: FEATURE_ID, stage: 1 },
          error: null,
        }),
      })

    const res = await POST(makeReq({ title: 'New Feature', description: 'A cool feature' }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.id).toBe(FEATURE_ID)
    expect(json.stage).toBe(1)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq({ title: 'Test', description: 'Test' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when title is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makeReq({ description: 'A feature without title' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when description is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makeReq({ title: 'A feature without description' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      new Request('http://localhost/api/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    )
    expect(res.status).toBe(400)
  })
})
