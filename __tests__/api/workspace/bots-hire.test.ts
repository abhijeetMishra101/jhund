import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

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

function userChain(workspaceId: string | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: workspaceId ? { workspace_id: workspaceId } : null }),
  }
}

function botRolesChain(existing: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: undefined,
    // For .select().eq() pattern returning array
    data: existing,
  }
}

function insertSingleChain(data: unknown, error: unknown = null) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  }
}

function insertChain(error: unknown = null) {
  return {
    insert: vi.fn().mockResolvedValue({ error }),
  }
}

function selectEqChain(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data }),
  }
}

function existingBotsChain(data: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: vi.fn().mockResolvedValue({ data, error: null }),
    // Spread to allow awaiting
    [Symbol.iterator]: undefined,
  }
}

describe('POST /api/workspace/bots (hire)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockServiceFrom.mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = new Request('http://localhost/api/workspace/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleKey: 'backend' }),
    })
    const { POST } = await import('@/app/api/workspace/bots/route')
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid roleKey', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReturnValueOnce(userChain(WORKSPACE_ID))

    const req = new Request('http://localhost/api/workspace/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleKey: 'ops' }), // ops is not hireable
    })
    const { POST } = await import('@/app/api/workspace/bots/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when bot role already exists for workspace', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const selectSingleChain = (data: unknown) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data }),
    })

    mockServiceFrom
      .mockReturnValueOnce(selectSingleChain({ workspace_id: WORKSPACE_ID })) // users
      .mockReturnValueOnce(selectSingleChain({ name: 'Acme' }))               // workspaces
      .mockReturnValueOnce(selectSingleChain({ id: BOT_ID, role_key: 'backend' })) // bot_roles check

    const req = new Request('http://localhost/api/workspace/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleKey: 'backend' }),
    })
    const { POST } = await import('@/app/api/workspace/bots/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('already hired')
  })

  it('creates bot, channel, welcome message, and Riley announcement on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const newBot = { id: BOT_ID, workspace_id: WORKSPACE_ID, role_key: 'backend', display_name: 'Sam' }
    const newChannel = { id: CHANNEL_ID, workspace_id: WORKSPACE_ID, name: 'engineering', display_name: 'Engineering', bot_role_id: BOT_ID, position: 1, archived: false, channel_type: 'channel' as const, created_at: '' }

    const selectSingleChain = (data: unknown) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data }),
    })

    // channels position query uses .order().limit(1).single()
    const channelPositionChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { position: 0 } }),
    }

    mockServiceFrom
      .mockReturnValueOnce(selectSingleChain({ workspace_id: WORKSPACE_ID })) // users
      .mockReturnValueOnce(selectSingleChain({ name: 'Acme' }))               // workspaces
      .mockReturnValueOnce(selectSingleChain(null))                            // bot_roles duplicate check (none)
      // insert bot_role
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: newBot, error: null }),
          }),
        }),
      })
      .mockReturnValueOnce(channelPositionChain) // channels position
      // insert channel
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: newChannel, error: null }),
          }),
        }),
      })
      // channel_members seed (new — auto-seeds primary bot into channel)
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })
      // welcome message
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })
      .mockReturnValueOnce(selectSingleChain({ id: OPS_CHANNEL_ID, bot_role_id: OPS_BOT_ID })) // ops channel
      // ops announcement
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })

    const req = new Request('http://localhost/api/workspace/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleKey: 'backend' }),
    })
    const { POST } = await import('@/app/api/workspace/bots/route')
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.bot.id).toBe(BOT_ID)
    expect(body.channel.id).toBe(CHANNEL_ID)
  })

  it('seeds channel_members with is_primary: true when bot is hired', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const newBot = { id: BOT_ID, workspace_id: WORKSPACE_ID, role_key: 'backend', display_name: 'Sam' }
    const newChannel = { id: CHANNEL_ID, workspace_id: WORKSPACE_ID, name: 'engineering', display_name: 'Engineering', bot_role_id: BOT_ID, position: 1, archived: false, channel_type: 'channel' as const, created_at: '' }

    const selectSingleChain = (data: unknown) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data }),
    })
    const channelPositionChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { position: 0 } }),
    }
    const channelMembersInsert = vi.fn().mockResolvedValue({ error: null })

    mockServiceFrom
      .mockReturnValueOnce(selectSingleChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(selectSingleChain({ name: 'Acme' }))
      .mockReturnValueOnce(selectSingleChain(null))
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: newBot, error: null }),
          }),
        }),
      })
      .mockReturnValueOnce(channelPositionChain)
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: newChannel, error: null }),
          }),
        }),
      })
      // channel_members — capture the insert call so we can assert its payload
      .mockReturnValueOnce({ insert: channelMembersInsert })
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) }) // welcome msg
      .mockReturnValueOnce(selectSingleChain({ id: OPS_CHANNEL_ID, bot_role_id: OPS_BOT_ID }))
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) }) // announcement

    const req = new Request('http://localhost/api/workspace/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleKey: 'backend' }),
    })
    const { POST } = await import('@/app/api/workspace/bots/route')
    await POST(req)

    expect(channelMembersInsert).toHaveBeenCalledWith({
      channel_id: CHANNEL_ID,
      bot_role_id: BOT_ID,
      is_primary: true,
    })
  })
})
