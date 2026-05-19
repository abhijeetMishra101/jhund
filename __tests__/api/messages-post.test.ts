import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/messages/route'

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
vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn((p: Promise<unknown>) => p),
}))
vi.mock('@/lib/bots', () => ({
  respondToMessage: vi.fn().mockResolvedValue('msg-uuid'),
  ActionCapExceededError: class ActionCapExceededError extends Error {},
}))

function setupAuthMocks(channelData: unknown = { id: CHANNEL_ID }, messageId = 'msg-uuid') {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  mockServiceFrom.mockReset()
  mockServiceFrom
    .mockReturnValueOnce({ // users
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
    })
    .mockReturnValueOnce({ // channels anti-IDOR
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: channelData, error: channelData ? null : { message: 'not found' } }),
    })
    .mockReturnValueOnce({ // messages insert
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: messageId }, error: null }),
    })
}

function makeReq(body: unknown) {
  return new Request('http://localhost/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/messages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 201 with message id on success', async () => {
    setupAuthMocks()
    const res = await POST(makeReq({ channelId: CHANNEL_ID, content: 'hello' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'msg-uuid' })
  })

  it('calls respondToMessage via waitUntil after storing message', async () => {
    setupAuthMocks()
    const { waitUntil } = await import('@vercel/functions')
    const { respondToMessage } = await import('@/lib/bots')
    await POST(makeReq({ channelId: CHANNEL_ID, content: 'hello' }))
    expect(waitUntil).toHaveBeenCalledOnce()
    // content is now passed as the 4th arg so @mention routing works correctly
    expect(respondToMessage).toHaveBeenCalledWith(CHANNEL_ID, WORKSPACE_ID, undefined, 'hello')
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq({ channelId: CHANNEL_ID, content: 'hello' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(new Request('http://localhost/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when channelId is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makeReq({ content: 'hello' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when content is empty string', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makeReq({ channelId: CHANNEL_ID, content: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when user row is not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReset()
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    const res = await POST(makeReq({ channelId: CHANNEL_ID, content: 'hello' }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when channel does not belong to workspace (anti-IDOR)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReset()
    mockServiceFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

    const res = await POST(makeReq({ channelId: 'other-channel', content: 'hello' }))
    expect(res.status).toBe(404)
  })

  it('returns 201 when respondToMessage throws a generic error (error silently swallowed)', async () => {
    setupAuthMocks()
    const { respondToMessage } = await import('@/lib/bots')
    vi.mocked(respondToMessage).mockRejectedValueOnce(new Error('unexpected failure'))
    const res = await POST(makeReq({ channelId: CHANNEL_ID, content: 'hello' }))
    expect(res.status).toBe(201)
  })

  it('returns 500 when message insert fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
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
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      })

    const res = await POST(makeReq({ channelId: CHANNEL_ID, content: 'hello' }))
    expect(res.status).toBe(500)
  })
})
