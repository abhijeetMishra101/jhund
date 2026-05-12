import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/channels/route'

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'workspace-uuid'
const CHANNELS = [{ id: 'ch-1', name: 'engineering', display_name: 'Engineering', workspace_id: WORKSPACE_ID, bot_role_id: null, position: 0, channel_type: 'channel', archived: false, created_at: '2024-01-01T00:00:00Z' }]

const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

/** Build a mock chain for users.select().eq().single() */
function usersChain(userData: unknown) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data: userData, error: userData ? null : { message: 'not found' } })
  return chain
}

/** Build a mock chain for channels.select().eq().order() → resolves with channels data */
function channelsChain(channelsData: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockResolvedValue({ data: channelsData, error })
  return chain
}

/** Build a mock chain for channel_members.select().eq().in().order() */
function channelMembersChain(memberData: unknown) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockResolvedValue({ data: memberData, error: null })
  return chain
}

/** Build a mock chain for bot_roles.select().in() → resolves with bots */
function botRolesInChain(botData: unknown) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockResolvedValue({ data: botData, error: null })
  return chain
}

describe('GET /api/channels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
  })

  it('returns channels for authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom
      .mockReturnValueOnce(usersChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(channelsChain(CHANNELS))
      .mockReturnValueOnce(channelMembersChain([]))  // no members
    // bot_roles fetch not called when no members

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.channels).toHaveLength(1)
    expect(body.channels[0].id).toBe('ch-1')
    expect(body.channels[0].members).toEqual([])
  })

  it('includes members array with bot details when channel_members exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const memberRows = [{ channel_id: 'ch-1', bot_role_id: 'bot-1', is_primary: true }]
    const botRows = [{ id: 'bot-1', display_name: 'Sam', avatar_seed: 'sam', status: 'online' }]

    mockFrom
      .mockReturnValueOnce(usersChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(channelsChain(CHANNELS))
      .mockReturnValueOnce(channelMembersChain(memberRows))
      .mockReturnValueOnce(botRolesInChain(botRows))

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.channels[0].members).toHaveLength(1)
    expect(body.channels[0].members[0]).toMatchObject({
      id: 'bot-1', name: 'Sam', avatar_seed: 'sam', status: 'online', is_primary: true,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 500 when channels fetch returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom
      .mockReturnValueOnce(usersChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(channelsChain(null, { message: 'DB error' }))

    const res = await GET()
    expect(res.status).toBe(500)
  })

  it('returns 404 when user has no workspace', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValueOnce(usersChain({ workspace_id: null }))

    const res = await GET()
    expect(res.status).toBe(404)
  })
})
