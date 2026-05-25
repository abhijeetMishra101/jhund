import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockFrom }),
}))

const WORKSPACE_ID = 'ws-1'
const ROLE_IDS = {
  ops: 'role-ops',
  product: 'role-product',
  backend: 'role-backend',
  design: 'role-design',
  security: 'role-security',
  qa: 'role-qa',
  ml: 'role-ml',
}

/** Bot roles insert chain — returns seeded roles with ids */
function botRolesInsertChain() {
  const roles = Object.entries(ROLE_IDS).map(([key, id]) => ({ id, role_key: key }))
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: roles, error: null }),
    }),
  }
}

/** Channels insert chain — returns channels with predictable ids */
function channelsInsertChain(channelDefs: { name: string }[]) {
  const channels = channelDefs.map((c, idx) => ({ id: `ch-${idx}`, name: c.name }))
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: channels, error: null }),
    }),
  }
}

/** channel_members insert chain */
function membersInsertChain() {
  const insertFn = vi.fn().mockResolvedValue({ error: null })
  return { insert: insertFn, _insertFn: insertFn }
}

describe('seedWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
  })

  it('inserts channel_members for every channel after seeding startup template', async () => {
    const startupChannels = [
      { name: 'ops' }, { name: 'decisions' }, { name: 'product' }, { name: 'engineering' },
      { name: 'design' }, { name: 'security' }, { name: 'qa' },
      { name: 'ml' }, { name: 'standup' }, { name: 'retrospective' },
    ]
    const membersChain = membersInsertChain()

    mockFrom
      .mockReturnValueOnce(botRolesInsertChain())           // bot_roles
      .mockReturnValueOnce(channelsInsertChain(startupChannels)) // channels
      .mockReturnValueOnce(membersChain)                    // channel_members

    const { seedWorkspace } = await import('@/lib/templates/seed')
    await seedWorkspace(WORKSPACE_ID, 'Acme', 'startup')

    // channel_members.insert must have been called
    expect(membersChain._insertFn).toHaveBeenCalledOnce()

    // Every row must have channel_id, bot_role_id, is_primary: true
    const rows: { channel_id: string; bot_role_id: string; is_primary: boolean }[] =
      membersChain._insertFn.mock.calls[0][0]

    expect(rows.length).toBe(startupChannels.length)
    rows.forEach((r) => {
      expect(r.channel_id).toBeDefined()
      expect(r.bot_role_id).toBeDefined()
      expect(r.is_primary).toBe(true)
    })

    // decisions channel must be present
    const decisionsIdx = startupChannels.findIndex((c) => c.name === 'decisions')
    expect(rows[decisionsIdx].channel_id).toBe(`ch-${decisionsIdx}`)
  })

  it('inserts channel_members for the blank template (ops + decisions + standup + retrospective)', async () => {
    const blankChannels = [
      { name: 'ops' }, { name: 'decisions' }, { name: 'standup' }, { name: 'retrospective' },
    ]
    const membersChain = membersInsertChain()

    mockFrom
      .mockReturnValueOnce(botRolesInsertChain())
      .mockReturnValueOnce(channelsInsertChain(blankChannels))
      .mockReturnValueOnce(membersChain)

    const { seedWorkspace } = await import('@/lib/templates/seed')
    await seedWorkspace(WORKSPACE_ID, 'Acme', 'blank')

    const rows: { channel_id: string; bot_role_id: string; is_primary: boolean }[] =
      membersChain._insertFn.mock.calls[0][0]

    expect(rows.length).toBe(blankChannels.length)
    expect(rows.every((r) => r.is_primary === true)).toBe(true)
  })

  it('skips channel_members insert when all bot_role_ids are undefined', async () => {
    // Simulate roleMap returning nothing useful (edge case)
    mockFrom
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [], error: null }), // no roles
        }),
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [], error: null }), // no channels
        }),
      })
    // channel_members insert should NOT be called

    const { seedWorkspace } = await import('@/lib/templates/seed')
    await seedWorkspace(WORKSPACE_ID, 'Acme', 'startup')

    // mockFrom called twice (bot_roles, channels) — not a third time for channel_members
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })
})
