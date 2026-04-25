import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/channels/route'

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'workspace-uuid'
const CHANNELS = [{ id: 'ch-1', name: 'engineering', display_name: 'Engineering', workspace_id: WORKSPACE_ID, bot_role_id: null, position: 0, created_at: '2024-01-01T00:00:00Z' }]

const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

function setupMocks(userData: unknown = { workspace_id: WORKSPACE_ID }, channelsData: unknown = CHANNELS) {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  let callIdx = 0
  mockFrom.mockImplementation(() => {
    callIdx++
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockResolvedValue(callIdx === 2 ? { data: channelsData, error: null } : null)
    chain.single = vi.fn().mockResolvedValue({ data: callIdx === 1 ? userData : null, error: null })
    return chain
  })
}

describe('GET /api/channels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
  })

  it('returns channels for authenticated user', async () => {
    setupMocks()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.channels).toEqual(CHANNELS)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 404 when user has no workspace', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { workspace_id: null }, error: null }),
    })
    const res = await GET()
    expect(res.status).toBe(404)
  })
})
