import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/messages/[channelId]/route'

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'workspace-uuid'
const CHANNEL_ID = 'channel-uuid'
const PLAN_ID = 'plan-uuid'

const MESSAGES = [
  { id: 'msg-1', author_type: 'user', author_id: USER_ID, content: 'hello', plan_id: null, created_at: '2024-01-01T00:00:00Z' },
  { id: 'msg-2', author_type: 'bot', author_id: 'bot-uuid', content: 'I will open an issue', plan_id: PLAN_ID, created_at: '2024-01-01T00:01:00Z' },
]

const mockGetUser = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

describe('GET /api/messages/[channelId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns messages including the plan_id field', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    // Track which columns were selected
    let selectedColumns = ''
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
        }
      }
      if (table === 'channels') {
        return {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: CHANNEL_ID }, error: null }),
        }
      }
      // messages table — capture the select columns
      return {
        select: vi.fn().mockImplementation((cols: string) => {
          selectedColumns = cols
          return { eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: MESSAGES, error: null }) }
        }),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: MESSAGES, error: null }),
      }
    })

    const req = new Request(`http://localhost/api/messages/${CHANNEL_ID}`)
    const res = await GET(req, { params: { channelId: CHANNEL_ID } })

    expect(res.status).toBe(200)
    // plan_id must be in the SELECT clause — this is the test that would have caught the bug
    expect(selectedColumns).toContain('plan_id')

    const body = await res.json()
    const botMsg = body.find((m: { id: string }) => m.id === 'msg-2')
    expect(botMsg?.plan_id).toBe(PLAN_ID)
  })

  it('returns messages in ascending created_at order', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    let orderArg: { ascending: boolean } | null = null

    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'users') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }) }
      if (table === 'channels') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: CHANNEL_ID }, error: null }) }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockImplementation((_col: string, opts: { ascending: boolean }) => {
          orderArg = opts
          return Promise.resolve({ data: MESSAGES, error: null })
        }),
      }
    })

    const req = new Request(`http://localhost/api/messages/${CHANNEL_ID}`)
    await GET(req, { params: { channelId: CHANNEL_ID } })
    expect(orderArg?.ascending).toBe(true)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = new Request(`http://localhost/api/messages/${CHANNEL_ID}`)
    const res = await GET(req, { params: { channelId: CHANNEL_ID } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when userRow is null (user not found)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    const req = new Request(`http://localhost/api/messages/${CHANNEL_ID}`)
    const res = await GET(req, { params: { channelId: CHANNEL_ID } })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('User not found')
  })

  it('returns 500 when messages DB query fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: CHANNEL_ID }, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        })),
      })
    const req = new Request(`http://localhost/api/messages/${CHANNEL_ID}`)
    const res = await GET(req, { params: { channelId: CHANNEL_ID } })
    expect(res.status).toBe(500)
  })

  it('returns 404 when channel does not belong to user workspace (anti-IDOR)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }), // channel not found in workspace
      })

    const req = new Request(`http://localhost/api/messages/other-channel`)
    const res = await GET(req, { params: { channelId: 'other-channel' } })
    expect(res.status).toBe(404)
  })
})
