import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/plans/[id]/route'

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'workspace-uuid'
const CHANNEL_ID = 'channel-uuid'
const PLAN_ID = 'plan-uuid'

const PLAN = { id: PLAN_ID, status: 'pending', description_md: 'Create a bug report', channel_id: CHANNEL_ID }

const mockGetUser = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

function chain(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {}
  obj.select = vi.fn().mockReturnValue(obj)
  obj.eq = vi.fn().mockReturnValue(obj)
  obj.single = vi.fn().mockResolvedValue({ data, error })
  return obj
}

describe('GET /api/plans/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  })

  it('returns id, status, and description_md for a valid plan', async () => {
    mockServiceFrom
      .mockReturnValueOnce(chain({ workspace_id: WORKSPACE_ID }))   // users
      .mockReturnValueOnce(chain(PLAN))                               // plans
      .mockReturnValueOnce(chain({ workspace_id: WORKSPACE_ID }))   // channels

    const req = new Request(`http://localhost/api/plans/${PLAN_ID}`)
    const res = await GET(req, { params: { id: PLAN_ID } })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ id: PLAN_ID, status: 'pending', description_md: 'Create a bug report' })
  })

  it('returns 404 when plan does not exist', async () => {
    mockServiceFrom
      .mockReturnValueOnce(chain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(chain(null, { message: 'not found' }))

    const req = new Request(`http://localhost/api/plans/${PLAN_ID}`)
    const res = await GET(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(404)
  })

  it('returns 403 when plan belongs to a different workspace', async () => {
    mockServiceFrom
      .mockReturnValueOnce(chain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(chain(PLAN))
      .mockReturnValueOnce(chain({ workspace_id: 'other-workspace' })) // channel mismatch

    const req = new Request(`http://localhost/api/plans/${PLAN_ID}`)
    const res = await GET(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(403)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const req = new Request(`http://localhost/api/plans/${PLAN_ID}`)
    const res = await GET(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(401)
  })
})
