import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/channels/[id]/members/route'
import { DELETE } from '@/app/api/channels/[id]/members/[botRoleId]/route'
import { GET } from '@/app/api/channels/[id]/available-bots/route'

const USER_ID = 'user-1'
const WORKSPACE_ID = 'ws-1'
const CHANNEL_ID = 'ch-1'
const BOT_ID = 'bot-1'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

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

/** Helper: builds a fluent mock chain ending in .single() → data */
function singleChain(data: unknown, error: unknown = null) {
  const c: Record<string, unknown> = {}
  c.select = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  c.single = vi.fn().mockResolvedValue({ data, error })
  return c
}

/** Helper: insert chain ending in the insert call */
function insertChain(error: unknown = null) {
  const c: Record<string, unknown> = {}
  c.insert = vi.fn().mockResolvedValue({ error })
  return c
}

/** Helper: delete chain */
function deleteChain(error: unknown = null) {
  const c: Record<string, unknown> = {}
  c.delete = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  return { ...c, _resolve: error }
}

function makeParams(id: string, botRoleId?: string) {
  return Promise.resolve(botRoleId ? { id, botRoleId } : { id })
}

// ─── POST /api/channels/[id]/members ─────────────────────────────────────────

describe('POST /api/channels/[id]/members', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = new Request('http://test', {
      method: 'POST',
      body: JSON.stringify({ bot_role_id: BOT_ID }),
    })
    const res = await POST(req, { params: makeParams(CHANNEL_ID) as Promise<{ id: string }> })
    expect(res.status).toBe(401)
  })

  it('returns 400 when bot_role_id is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const userChain = singleChain({ workspace_id: WORKSPACE_ID })
    const channelChain = singleChain({ id: CHANNEL_ID, workspace_id: WORKSPACE_ID })
    mockFrom
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(channelChain)

    const req = new Request('http://test', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req, { params: makeParams(CHANNEL_ID) as Promise<{ id: string }> })
    expect(res.status).toBe(400)
  })

  it('adds a bot to a channel and returns 201', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const bot = { id: BOT_ID, display_name: 'Casey', avatar_seed: 'casey', role_key: 'qa', status: 'online' }

    const userChain = singleChain({ workspace_id: WORKSPACE_ID })
    const channelChain = singleChain({ id: CHANNEL_ID, workspace_id: WORKSPACE_ID })
    const botChain = singleChain(bot)
    const existingChain = singleChain(null, { message: 'not found' }) // not a member yet
    const ins = insertChain()

    mockFrom
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(channelChain)
      .mockReturnValueOnce(botChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(ins)

    const req = new Request('http://test', {
      method: 'POST',
      body: JSON.stringify({ bot_role_id: BOT_ID }),
    })
    const res = await POST(req, { params: makeParams(CHANNEL_ID) as Promise<{ id: string }> })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.member).toMatchObject({ bot_role_id: BOT_ID, display_name: 'Casey', is_primary: false })
  })

  it('returns 409 when bot is already in channel', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const bot = { id: BOT_ID, display_name: 'Casey', avatar_seed: 'casey', role_key: 'qa', status: 'online' }

    const userChain = singleChain({ workspace_id: WORKSPACE_ID })
    const channelChain = singleChain({ id: CHANNEL_ID, workspace_id: WORKSPACE_ID })
    const botChain = singleChain(bot)
    const existingChain = singleChain({ channel_id: CHANNEL_ID }) // already a member

    mockFrom
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(channelChain)
      .mockReturnValueOnce(botChain)
      .mockReturnValueOnce(existingChain)

    const req = new Request('http://test', {
      method: 'POST',
      body: JSON.stringify({ bot_role_id: BOT_ID }),
    })
    const res = await POST(req, { params: makeParams(CHANNEL_ID) as Promise<{ id: string }> })
    expect(res.status).toBe(409)
  })
})

// ─── DELETE /api/channels/[id]/members/[botRoleId] ────────────────────────────

describe('DELETE /api/channels/[id]/members/[botRoleId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = new Request('http://test', { method: 'DELETE' })
    const res = await DELETE(req, { params: makeParams(CHANNEL_ID, BOT_ID) as Promise<{ id: string; botRoleId: string }> })
    expect(res.status).toBe(401)
  })

  it('removes bot and returns 204', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const userChain = singleChain({ workspace_id: WORKSPACE_ID })
    const channelChain = singleChain({ id: CHANNEL_ID, workspace_id: WORKSPACE_ID })

    // delete chain: .delete().eq().eq() → resolves { error: null }
    const delChain: Record<string, unknown> = {}
    delChain.delete = vi.fn().mockReturnValue(delChain)
    delChain.eq = vi.fn().mockReturnValue(delChain)
    // last .eq() call must resolve
    let eqCallCount = 0
    ;(delChain.eq as ReturnType<typeof vi.fn>).mockImplementation(() => {
      eqCallCount++
      if (eqCallCount === 2) return Promise.resolve({ error: null })
      return delChain
    })

    mockFrom
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(channelChain)
      .mockReturnValueOnce(delChain)

    const req = new Request('http://test', { method: 'DELETE' })
    const res = await DELETE(req, { params: makeParams(CHANNEL_ID, BOT_ID) as Promise<{ id: string; botRoleId: string }> })
    expect(res.status).toBe(204)
  })
})

// ─── GET /api/channels/[id]/available-bots ────────────────────────────────────

describe('GET /api/channels/[id]/available-bots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = new Request('http://test')
    const res = await GET(req, { params: makeParams(CHANNEL_ID) as Promise<{ id: string }> })
    expect(res.status).toBe(401)
  })

  it('returns bots not already in channel', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const userChain = singleChain({ workspace_id: WORKSPACE_ID })
    const channelChain = singleChain({ id: CHANNEL_ID, workspace_id: WORKSPACE_ID, display_name: '# engineering' })

    // channel_members: bot-1 is already there
    const membersChain: Record<string, unknown> = {}
    membersChain.select = vi.fn().mockReturnValue(membersChain)
    membersChain.eq = vi.fn().mockResolvedValue({ data: [{ bot_role_id: 'bot-1' }], error: null })

    // all bots in workspace: bot-1 and bot-2
    const botsChain: Record<string, unknown> = {}
    botsChain.select = vi.fn().mockReturnValue(botsChain)
    botsChain.eq = vi.fn().mockReturnValue(botsChain)
    botsChain.order = vi.fn().mockResolvedValue({
      data: [
        { id: 'bot-1', display_name: 'Sam', avatar_seed: 'sam', role_key: 'backend', status: 'online' },
        { id: 'bot-2', display_name: 'Casey', avatar_seed: 'casey', role_key: 'qa', status: 'online' },
      ],
      error: null,
    })

    mockFrom
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(channelChain)
      .mockReturnValueOnce(membersChain)
      .mockReturnValueOnce(botsChain)

    const req = new Request('http://test')
    const res = await GET(req, { params: makeParams(CHANNEL_ID) as Promise<{ id: string }> })
    expect(res.status).toBe(200)
    const body = await res.json()
    // bot-1 is already a member, so only bot-2 returned
    expect(body.bots).toHaveLength(1)
    expect(body.bots[0].id).toBe('bot-2')
    expect(body.channelName).toBe('# engineering')
  })

  it('returns empty array when all bots are already in channel', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const userChain = singleChain({ workspace_id: WORKSPACE_ID })
    const channelChain = singleChain({ id: CHANNEL_ID, workspace_id: WORKSPACE_ID, display_name: '# engineering' })

    const membersChain: Record<string, unknown> = {}
    membersChain.select = vi.fn().mockReturnValue(membersChain)
    membersChain.eq = vi.fn().mockResolvedValue({ data: [{ bot_role_id: 'bot-1' }], error: null })

    const botsChain: Record<string, unknown> = {}
    botsChain.select = vi.fn().mockReturnValue(botsChain)
    botsChain.eq = vi.fn().mockReturnValue(botsChain)
    botsChain.order = vi.fn().mockResolvedValue({
      data: [{ id: 'bot-1', display_name: 'Sam', avatar_seed: 'sam', role_key: 'backend', status: 'online' }],
      error: null,
    })

    mockFrom
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(channelChain)
      .mockReturnValueOnce(membersChain)
      .mockReturnValueOnce(botsChain)

    const req = new Request('http://test')
    const res = await GET(req, { params: makeParams(CHANNEL_ID) as Promise<{ id: string }> })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.bots).toHaveLength(0)
  })
})
