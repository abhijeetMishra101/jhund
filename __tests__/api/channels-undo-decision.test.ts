import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/channels/[id]/undo-decision/route'

const USER_ID = 'user-1'
const WORKSPACE_ID = 'ws-1'
const CHANNEL_ID = 'ch-1'
const BOT_ROLE_ID = 'bot-1'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockUndoDecision = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
  createServiceClient: vi.fn().mockReturnValue({
    from: mockFrom,
  }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))
vi.mock('@/lib/decisions/undo', () => ({
  undoDecision: mockUndoDecision,
}))

function singleChain(data: unknown) {
  const c: Record<string, unknown> = {}
  c.select = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  c.single = vi.fn().mockResolvedValue({ data, error: null })
  return c
}

function insertChain() {
  const c: Record<string, unknown> = {}
  c.insert = vi.fn().mockResolvedValue({ error: null })
  return c
}

function makeParams(id: string) {
  return Promise.resolve({ id })
}

/** Queue the standard ownership + membership mocks */
function setupOwnershipMocks(hasMembership = true) {
  const userChain = singleChain({ workspace_id: WORKSPACE_ID })
  const channelChain = singleChain({ id: CHANNEL_ID, workspace_id: WORKSPACE_ID })
  const membershipChain = singleChain(hasMembership ? { bot_role_id: BOT_ROLE_ID } : null)
  mockFrom
    .mockReturnValueOnce(userChain)
    .mockReturnValueOnce(channelChain)
    .mockReturnValueOnce(membershipChain)
}

// ─── POST /api/channels/[id]/undo-decision ────────────────────────────────────

describe('POST /api/channels/[id]/undo-decision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(new Request('http://test', { method: 'POST' }), {
      params: makeParams(CHANNEL_ID) as Promise<{ id: string }>,
    })
    expect(res.status).toBe(401)
  })

  it('returns 404 when workspace not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValueOnce(singleChain(null)) // no workspace
    const res = await POST(new Request('http://test', { method: 'POST' }), {
      params: makeParams(CHANNEL_ID) as Promise<{ id: string }>,
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 when channel not found in workspace', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(singleChain(null)) // no channel
    const res = await POST(new Request('http://test', { method: 'POST' }), {
      params: makeParams(CHANNEL_ID) as Promise<{ id: string }>,
    })
    expect(res.status).toBe(404)
  })

  it('returns { undone: false } when no decision found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupOwnershipMocks()
    mockUndoDecision.mockResolvedValue({ undone: false })

    const res = await POST(new Request('http://test', { method: 'POST' }), {
      params: makeParams(CHANNEL_ID) as Promise<{ id: string }>,
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ undone: false })
  })

  it('posts quiet-undo system message and returns { undone: true } when not dispatched', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupOwnershipMocks()
    mockUndoDecision.mockResolvedValue({ undone: true, title: 'Ship it', actionWasDispatched: false })
    const ins = insertChain()
    mockFrom.mockReturnValueOnce(ins)

    const res = await POST(new Request('http://test', { method: 'POST' }), {
      params: makeParams(CHANNEL_ID) as Promise<{ id: string }>,
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ undone: true, title: 'Ship it' })
    expect(ins.insert).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('quietly removed') })
    )
  })

  it('posts dispatched-warning system message when action was already dispatched', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupOwnershipMocks()
    mockUndoDecision.mockResolvedValue({ undone: true, title: 'Ship it', actionWasDispatched: true })
    const ins = insertChain()
    mockFrom.mockReturnValueOnce(ins)

    await POST(new Request('http://test', { method: 'POST' }), {
      params: makeParams(CHANNEL_ID) as Promise<{ id: string }>,
    })
    expect(ins.insert).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('team already saw this') })
    )
  })

  it('uses user.id as fallback author_id when no primary bot in channel', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupOwnershipMocks(false) // no primary bot
    mockUndoDecision.mockResolvedValue({ undone: true, title: 'T', actionWasDispatched: false })
    const ins = insertChain()
    mockFrom.mockReturnValueOnce(ins)

    await POST(new Request('http://test', { method: 'POST' }), {
      params: makeParams(CHANNEL_ID) as Promise<{ id: string }>,
    })
    expect(ins.insert).toHaveBeenCalledWith(
      expect.objectContaining({ author_id: USER_ID })
    )
  })
})
