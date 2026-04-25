import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/plans/[id]/approve/route'

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'workspace-uuid'
const CHANNEL_ID = 'channel-uuid'
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
vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn((p: Promise<unknown>) => p),
}))
vi.mock('@/lib/github/executor', () => ({
  executePlanActions: vi.fn().mockResolvedValue(undefined),
}))

function planChain(status: string) {
  const obj: Record<string, unknown> = {}
  obj.select = vi.fn().mockReturnValue(obj)
  obj.eq = vi.fn().mockReturnValue(obj)
  obj.single = vi.fn().mockResolvedValue({ data: { id: PLAN_ID, status, channel_id: CHANNEL_ID }, error: null })
  obj.update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })
  obj.insert = vi.fn().mockResolvedValue({ data: null, error: null })
  return obj
}

function setupMocks(planStatus: string, channelWorkspace = WORKSPACE_ID) {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  mockServiceFrom
    .mockReturnValueOnce({  // users
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
    })
    .mockReturnValueOnce(planChain(planStatus))                    // plans
    .mockReturnValueOnce({  // channels
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { workspace_id: channelWorkspace }, error: null }),
    })
    .mockReturnValue({      // plans update + messages insert
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
}

describe('POST /api/plans/[id]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset() // drain any unconsumed mockReturnValueOnce queue from previous test
  })

  it('returns 200 ok for a pending plan', async () => {
    setupMocks('pending')
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/approve`, { method: 'POST' })
    const res = await POST(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('calls executePlanActions with the plan and workspace ids', async () => {
    setupMocks('pending')
    const { executePlanActions } = await import('@/lib/github/executor')
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/approve`, { method: 'POST' })
    await POST(req, { params: { id: PLAN_ID } })
    expect(executePlanActions).toHaveBeenCalledWith(PLAN_ID, WORKSPACE_ID)
  })

  it('wraps execution in waitUntil so Vercel stays alive', async () => {
    setupMocks('pending')
    const { waitUntil } = await import('@vercel/functions')
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/approve`, { method: 'POST' })
    await POST(req, { params: { id: PLAN_ID } })
    expect(waitUntil).toHaveBeenCalledOnce()
  })

  it('returns 404 when user row is not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/approve`, { method: 'POST' })
    const res = await POST(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(404)
  })

  it('returns 404 when plan row is not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/approve`, { method: 'POST' })
    const res = await POST(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(404)
  })

  it('returns 409 for an already-approved plan', async () => {
    setupMocks('approved')
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/approve`, { method: 'POST' })
    const res = await POST(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(409)
  })

  it('returns 409 for an already-rejected plan', async () => {
    setupMocks('rejected')
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/approve`, { method: 'POST' })
    const res = await POST(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(409)
  })

  it('returns 403 when plan belongs to a different workspace', async () => {
    setupMocks('pending', 'other-workspace')
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/approve`, { method: 'POST' })
    const res = await POST(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(403)
  })

  it('sets plan status to "failed" and inserts failure message when executePlanActions throws', async () => {
    const { executePlanActions } = await import('@/lib/github/executor')
    vi.mocked(executePlanActions).mockRejectedValueOnce(new Error('GitHub API error'))

    // Capture the promise passed to waitUntil so we can await it
    let capturedPromise: Promise<unknown> | null = null
    const { waitUntil } = await import('@vercel/functions')
    vi.mocked(waitUntil).mockImplementationOnce((p: Promise<unknown>) => {
      capturedPromise = p
    })

    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })
    const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null })

    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom
      .mockReturnValueOnce({ // users
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
      })
      .mockReturnValueOnce(planChain('pending'))  // plans
      .mockReturnValueOnce({ // channels
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
      })
      .mockReturnValue({ // subsequent calls: plan update + message inserts
        update: mockUpdate,
        insert: mockInsert,
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/approve`, { method: 'POST' })
    const res = await POST(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(200)

    // Wait for the background task to complete (catch path)
    await capturedPromise

    // The catch handler should have updated the plan to 'failed'
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
    // And inserted a failure message
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('GitHub API error'),
    }))
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = new Request(`http://localhost/api/plans/${PLAN_ID}/approve`, { method: 'POST' })
    const res = await POST(req, { params: { id: PLAN_ID } })
    expect(res.status).toBe(401)
  })
})
