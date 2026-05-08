import { describe, it, expect, vi, beforeEach } from 'vitest'

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'workspace-uuid'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

function userChain(workspaceId: string | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: workspaceId ? { workspace_id: workspaceId } : null, error: null }),
  }
}

function resetChain(data: unknown) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error: data ? null : { message: 'update failed' } }),
        }),
      }),
    }),
  }
}

describe('POST /api/workspace/reset-cap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
  })

  it('returns 200 with ok:true and resets actions_used to 0', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom
      .mockReturnValueOnce(userChain(WORKSPACE_ID))
      .mockReturnValueOnce(resetChain({ actions_used: 0, action_cap: 50 }))

    const { POST } = await import('@/app/api/workspace/reset-cap/route')
    const res = await POST()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.actions_used).toBe(0)
    expect(body.action_cap).toBe(50)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/workspace/reset-cap/route')
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns 404 when user has no workspace', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReturnValueOnce(userChain(null))
    const { POST } = await import('@/app/api/workspace/reset-cap/route')
    const res = await POST()
    expect(res.status).toBe(404)
  })

  it('returns 500 when DB update fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom
      .mockReturnValueOnce(userChain(WORKSPACE_ID))
      .mockReturnValueOnce(resetChain(null))
    const { POST } = await import('@/app/api/workspace/reset-cap/route')
    const res = await POST()
    expect(res.status).toBe(500)
  })
})
