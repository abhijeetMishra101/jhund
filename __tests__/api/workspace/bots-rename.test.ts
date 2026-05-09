import { describe, it, expect, vi, beforeEach } from 'vitest'

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'ws-uuid'
const BOT_ID = 'bot-uuid'
const OPS_CHANNEL_ID = 'ops-ch-uuid'
const OPS_BOT_ID = 'ops-bot-uuid'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

function makeReq(body: object) {
  return new Request('http://localhost', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const makeParams = (id: string) => ({ params: { id } })

describe('PATCH /api/workspace/bots/[id] (rename)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockServiceFrom.mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('@/app/api/workspace/bots/[id]/route')
    const res = await PATCH(makeReq({ displayName: 'NewName' }), makeParams(BOT_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 when displayName is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const { PATCH } = await import('@/app/api/workspace/bots/[id]/route')
    const res = await PATCH(makeReq({}), makeParams(BOT_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 when displayName exceeds 32 chars', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const { PATCH } = await import('@/app/api/workspace/bots/[id]/route')
    const res = await PATCH(makeReq({ displayName: 'A'.repeat(33) }), makeParams(BOT_ID))
    expect(res.status).toBe(400)
  })

  it('returns 403 when bot belongs to different workspace', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    mockServiceFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID } }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: BOT_ID, workspace_id: 'other-ws', display_name: 'Sam' } }),
      })

    const { PATCH } = await import('@/app/api/workspace/bots/[id]/route')
    const res = await PATCH(makeReq({ displayName: 'NewName' }), makeParams(BOT_ID))
    expect(res.status).toBe(403)
  })

  it('renames bot and Riley announces old→new name', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const updatedBot = { id: BOT_ID, workspace_id: WORKSPACE_ID, display_name: 'Benjamin', role_key: 'backend' }

    mockServiceFrom
      // users
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID } }),
      })
      // bot lookup
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: BOT_ID, workspace_id: WORKSPACE_ID, display_name: 'Sam' } }),
      })
      // update
      .mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: updatedBot, error: null }),
            }),
          }),
        }),
      })
      // ops channel
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: OPS_CHANNEL_ID, bot_role_id: OPS_BOT_ID } }),
      })
      // ops announcement
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })

    const { PATCH } = await import('@/app/api/workspace/bots/[id]/route')
    const res = await PATCH(makeReq({ displayName: 'Benjamin' }), makeParams(BOT_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.bot.display_name).toBe('Benjamin')
  })
})
