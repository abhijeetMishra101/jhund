import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/messages/route'

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'workspace-uuid'
const CHANNEL_ID = 'channel-uuid'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

const MESSAGES = [
  { id: 'msg-1', channel_id: CHANNEL_ID, author_type: 'user', author_id: USER_ID, content: 'hello', parent_id: null, reply_count: 0, created_at: '2024-01-01T00:00:00Z' },
  { id: 'msg-2', channel_id: CHANNEL_ID, author_type: 'bot', author_id: 'bot-1', content: 'hi', parent_id: null, reply_count: 1, created_at: '2024-01-01T00:01:00Z' },
]

function setupAuthSuccess() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  mockServiceFrom.mockReset()
  mockServiceFrom
    .mockReturnValueOnce({ // users
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
    })
    .mockReturnValueOnce({ // channels anti-IDOR
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: CHANNEL_ID }, error: null }),
    })
}

function makeReq(params: Record<string, string>) {
  const url = new URL('http://localhost/api/messages')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString())
}

describe('GET /api/messages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when channelId is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const req = makeReq({})
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/channelId/)
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = makeReq({ channelId: CHANNEL_ID })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 404 when user row not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReset()
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    })
    const req = makeReq({ channelId: CHANNEL_ID })
    const res = await GET(req)
    expect(res.status).toBe(404)
  })

  it('returns 404 when channel not found (anti-IDOR)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReset()
    mockServiceFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      })
    const req = makeReq({ channelId: CHANNEL_ID })
    const res = await GET(req)
    expect(res.status).toBe(404)
  })

  it('returns top-level messages when no parent_id provided', async () => {
    setupAuthSuccess()
    const isChain = vi.fn().mockResolvedValue({ data: MESSAGES, error: null })
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      is: isChain,
    })
    const req = makeReq({ channelId: CHANNEL_ID })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.messages).toHaveLength(2)
    expect(isChain).toHaveBeenCalledWith('parent_id', null)
  })

  it('filters messages by parent_id when provided (thread fetch)', async () => {
    setupAuthSuccess()
    const PARENT_ID = 'msg-2'
    const threadReply = { id: 'reply-1', channel_id: CHANNEL_ID, content: 'thread reply', parent_id: PARENT_ID }
    const eqChain = vi.fn().mockResolvedValue({ data: [threadReply], error: null })
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      // When parent_id is set, calls .eq('parent_id', parentId) not .is()
      is: vi.fn(),
    })
    // Re-mock with eq chain for parent_id filter
    mockServiceFrom.mockReset()
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
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnValue({ eq: eqChain }),
        is: vi.fn(),
      })
    const req = makeReq({ channelId: CHANNEL_ID, parent_id: PARENT_ID })
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('returns 500 when messages query fails', async () => {
    setupAuthSuccess()
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    })
    const req = makeReq({ channelId: CHANNEL_ID })
    const res = await GET(req)
    expect(res.status).toBe(500)
  })
})
