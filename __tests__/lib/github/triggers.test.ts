import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))

const WORKSPACE_ID = 'ws-uuid'

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  }
  // Allow chaining on all methods
  Object.keys(chain).forEach((k) => {
    if (typeof chain[k] === 'function' && k !== 'single' && k !== 'insert') {
      (chain[k] as ReturnType<typeof vi.fn>).mockReturnValue(chain)
    }
  })
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('seedDefaultTriggers', () => {
  it('skips seeding if triggers already exist', async () => {
    const insertMock = vi.fn()
    let callCount = 0
    mockServiceFrom.mockImplementation(() => makeChain({
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'existing' }, error: null }),
      insert: insertMock,
      // first call (existing check) returns a result
      select: vi.fn().mockImplementation(() => ({
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [{ id: 'existing' }], error: null }),
      })),
    }))

    const { seedDefaultTriggers } = await import('@/lib/github/triggers')
    await seedDefaultTriggers(WORKSPACE_ID)
    expect(insertMock).not.toHaveBeenCalled()
    void callCount
  })

  it('skips seeding for blank template (no default triggers)', async () => {
    const insertMock = vi.fn()
    let call = 0
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'github_triggers' && call++ === 0) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
      }
      if (table === 'workspaces') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { template: 'blank' }, error: null }),
        }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), insert: insertMock }
    })

    const { seedDefaultTriggers } = await import('@/lib/github/triggers')
    await seedDefaultTriggers(WORKSPACE_ID)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('seeds pull_request and security triggers for startup template', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    let triggerCall = 0

    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'github_triggers') {
        if (triggerCall++ === 0) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        return { insert: insertMock }
      }
      if (table === 'workspaces') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { template: 'startup' }, error: null }),
        }
      }
      if (table === 'channels') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: 'ch-eng', name: 'engineering', bot_role_id: 'bot-sam' },
              { id: 'ch-sec', name: 'security',    bot_role_id: 'bot-morgan' },
              { id: 'ch-ops', name: 'ops',          bot_role_id: 'bot-riley' },
            ],
            error: null,
          }),
        }
      }
      return {}
    })

    const { seedDefaultTriggers } = await import('@/lib/github/triggers')
    await seedDefaultTriggers(WORKSPACE_ID)

    expect(insertMock).toHaveBeenCalledOnce()
    const inserted = insertMock.mock.calls[0][0] as unknown[]
    // 6 triggers: pull_request→eng, issues security→sec, issues security→ops (parallel chain),
    // issues bug→eng, check_run→eng, release→ops (qa skipped — not in channel mock)
    expect(inserted).toHaveLength(6)
    expect(inserted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: 'pull_request', channel_id: 'ch-eng', chain_group: 'pr-review' }),
        expect.objectContaining({ event_type: 'issues', label_filter: 'security', channel_id: 'ch-sec', chain_group: 'security-alert' }),
        expect.objectContaining({ event_type: 'issues', label_filter: 'security', channel_id: 'ch-ops', chain_group: 'security-alert' }),
        expect.objectContaining({ event_type: 'issues', label_filter: 'bug', channel_id: 'ch-eng' }),
        expect.objectContaining({ event_type: 'check_run', channel_id: 'ch-eng' }),
        expect.objectContaining({ event_type: 'release', channel_id: 'ch-ops' }),
      ])
    )
  })

  it('seeds check_run and release triggers for startup template when all channels present', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    let triggerCall = 0

    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'github_triggers') {
        if (triggerCall++ === 0) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        return { insert: insertMock }
      }
      if (table === 'workspaces') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { template: 'startup' }, error: null }),
        }
      }
      if (table === 'channels') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: 'ch-eng', name: 'engineering', bot_role_id: 'bot-sam' },
              { id: 'ch-sec', name: 'security',    bot_role_id: 'bot-morgan' },
              { id: 'ch-ops', name: 'ops',          bot_role_id: 'bot-riley' },
            ],
            error: null,
          }),
        }
      }
      return {}
    })

    const { seedDefaultTriggers } = await import('@/lib/github/triggers')
    await seedDefaultTriggers(WORKSPACE_ID)

    const inserted = insertMock.mock.calls[0][0] as { event_type: string; channel_id: string }[]
    const eventTypes = inserted.map((t) => t.event_type)
    expect(eventTypes).toContain('check_run')
    expect(eventTypes).toContain('release')
    const checkRunTrigger = inserted.find((t) => t.event_type === 'check_run')
    const releaseTrigger = inserted.find((t) => t.event_type === 'release')
    expect(checkRunTrigger?.channel_id).toBe('ch-eng')
    expect(releaseTrigger?.channel_id).toBe('ch-ops')
  })

  it('does not seed check_run or release for blank template', async () => {
    const insertMock = vi.fn()
    let call = 0
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'github_triggers' && call++ === 0) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
      }
      if (table === 'workspaces') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { template: 'blank' }, error: null }),
        }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), insert: insertMock }
    })

    const { seedDefaultTriggers } = await import('@/lib/github/triggers')
    await seedDefaultTriggers(WORKSPACE_ID)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('skips trigger rules for channels that do not exist in the workspace', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    let triggerCall = 0

    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'github_triggers') {
        if (triggerCall++ === 0) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        return { insert: insertMock }
      }
      if (table === 'workspaces') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { template: 'startup' }, error: null }),
        }
      }
      if (table === 'channels') {
        // Only engineering exists — no security channel
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 'ch-eng', name: 'engineering', bot_role_id: 'bot-sam' }],
            error: null,
          }),
        }
      }
      return {}
    })

    const { seedDefaultTriggers } = await import('@/lib/github/triggers')
    await seedDefaultTriggers(WORKSPACE_ID)

    const inserted = insertMock.mock.calls[0][0] as unknown[]
    // Only engineering triggers (pull_request, bug, check_run); security + release skipped (no those channels)
    inserted.forEach((t) => {
      expect((t as { channel_id: string }).channel_id).toBe('ch-eng')
    })
    expect(inserted.map((t) => (t as { event_type: string }).event_type)).not.toContain('release')
  })
})
