import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/plans/[id]/reject/route'

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'workspace-uuid'
const CHANNEL_ID = 'channel-uuid'
const BOT_ROLE_ID = 'bot-role-uuid'
const PLAN_ID = 'plan-uuid'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

const insertedMessages: Record<string, unknown>[] = []

function setupMocks(planStatus: string, channelWorkspace = WORKSPACE_ID) {
  insertedMessages.length = 0
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  mockServiceFrom.mockImplementation((table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(
      table === 'users'
        ? { data: { workspace_id: WORKSPACE_ID }, error: null }
        : table === 'plans'
        ? { data: { id: PLAN_ID, status: planStatus, channel_id: CHANNEL_ID, bot_role_id: BOT_ROLE_ID }, error: null }
        : { data: { workspace_id: channelWorkspace }, error: null } // channels
    ),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      if (table === 'messages') insertedMessages.push(payload)
      return Promise.resolve({ data: null, error: null })
    }),
  }))
}

describe('POST /api/plans/[id]/reject', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 ok for a pending plan', async () => {
    setupMocks('pending')
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/reject`, { method: 'POST' })
    const res = await POST(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('posts a bot acknowledgement message into the channel', async () => {
    setupMocks('pending')
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/reject`, { method: 'POST' })
    await POST(req, { params: { id: PLAN_ID } })

    expect(insertedMessages).toHaveLength(1)
    const msg = insertedMessages[0]
    expect(msg.author_type).toBe('bot')
    expect(msg.author_id).toBe(BOT_ROLE_ID)
    expect(msg.channel_id).toBe(CHANNEL_ID)
    expect((msg.content as string).toLowerCase()).toContain("won't")
  })

  it('returns 409 for an already-rejected plan', async () => {
    setupMocks('rejected')
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/reject`, { method: 'POST' })
    const res = await POST(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(409)
  })

  it('returns 409 for an already-executed plan', async () => {
    setupMocks('executed')
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/reject`, { method: 'POST' })
    const res = await POST(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(409)
  })

  it('returns 403 when plan belongs to a different workspace', async () => {
    setupMocks('pending', 'other-workspace')
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/reject`, { method: 'POST' })
    const res = await POST(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(403)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/reject`, { method: 'POST' })
    const res = await POST(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(401)
  })
})
