import { describe, it, expect, vi, beforeEach } from 'vitest'

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'ws-uuid'
const BOT_ID = 'bot-uuid'
const CHANNEL_ID = 'ch-uuid'
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

const makeParams = (id: string) => ({ params: { id } })

describe('DELETE /api/workspace/bots/[id] (fire)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockServiceFrom.mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { DELETE } = await import('@/app/api/workspace/bots/[id]/route')
    const res = await DELETE(new Request('http://localhost'), makeParams(BOT_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 when trying to fire ops bot', async () => {
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
        single: vi.fn().mockResolvedValue({ data: { id: BOT_ID, workspace_id: WORKSPACE_ID, role_key: 'ops', display_name: 'Riley' } }),
      })

    const { DELETE } = await import('@/app/api/workspace/bots/[id]/route')
    const res = await DELETE(new Request('http://localhost'), makeParams(BOT_ID))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('ops')
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
        single: vi.fn().mockResolvedValue({ data: { id: BOT_ID, workspace_id: 'other-ws', role_key: 'backend', display_name: 'Sam' } }),
      })

    const { DELETE } = await import('@/app/api/workspace/bots/[id]/route')
    const res = await DELETE(new Request('http://localhost'), makeParams(BOT_ID))
    expect(res.status).toBe(403)
  })

  it('fires bot: farewell message, archives channel, Riley announces', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const bot = { id: BOT_ID, workspace_id: WORKSPACE_ID, role_key: 'backend', display_name: 'Sam' }

    mockServiceFrom
      // users
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID } }),
      })
      // bot_roles lookup
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: bot }),
      })
      // channel lookup
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: CHANNEL_ID } }),
      })
      // farewell message insert
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })
      // archive channel
      .mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      })
      // ops channel lookup
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: OPS_CHANNEL_ID, bot_role_id: OPS_BOT_ID } }),
      })
      // ops announcement
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })

    const { DELETE } = await import('@/app/api/workspace/bots/[id]/route')
    const res = await DELETE(new Request('http://localhost'), makeParams(BOT_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
