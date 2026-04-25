import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('@/lib/templates/seed', () => ({
  seedWorkspace: vi.fn().mockResolvedValue(undefined),
}))

const WORKSPACE = { id: 'ws-uuid', name: 'Acme', slug: 'acme', template: 'startup', action_cap: 50, actions_used: 0, working_style: 'balanced', github_installation_id: null, github_repo: null, created_at: '2024-01-01T00:00:00Z' }
const CHANNELS = [{ id: 'ch-1', name: 'engineering', display_name: 'Engineering', workspace_id: 'ws-uuid', bot_role_id: null, position: 0, created_at: '2024-01-01T00:00:00Z' }]

function chain(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {}
  obj.select = vi.fn().mockReturnValue(obj)
  obj.eq = vi.fn().mockReturnValue(obj)
  obj.order = vi.fn().mockReturnValue(obj)
  obj.insert = vi.fn().mockReturnValue(obj)
  obj.single = vi.fn().mockResolvedValue({ data, error })
  obj.mockResolvedValue = vi.fn().mockResolvedValue({ data, error })
  // For list queries that don't need .single()
  ;(obj as { then?: unknown }).then = undefined
  return obj
}

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', async () => {
    const { slugify } = await import('@/lib/auth')
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('strips leading and trailing hyphens', async () => {
    const { slugify } = await import('@/lib/auth')
    expect(slugify('  Clan  ')).toBe('clan')
  })

  it('collapses multiple special chars into one hyphen', async () => {
    const { slugify } = await import('@/lib/auth')
    expect(slugify('Acme & Co!')).toBe('acme-co')
  })

  it('truncates to 48 characters', async () => {
    const { slugify } = await import('@/lib/auth')
    expect(slugify('a'.repeat(60))).toHaveLength(48)
  })

  it('handles empty string', async () => {
    const { slugify } = await import('@/lib/auth')
    expect(slugify('')).toBe('')
  })
})

describe('createWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
  })

  it('inserts workspace, seeds it, inserts user row, returns workspace + channels', async () => {
    const { seedWorkspace } = await import('@/lib/templates/seed')

    mockServiceFrom
      .mockReturnValueOnce({ // workspaces insert
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: WORKSPACE, error: null }),
      })
      .mockReturnValueOnce({ // users insert
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      })
      .mockReturnValueOnce({ // channels select
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: CHANNELS, error: null }),
      })

    const { createWorkspace } = await import('@/lib/auth')
    const result = await createWorkspace({
      userId: 'user-uuid',
      name: 'Acme',
      slug: 'acme',
      template: 'startup',
      workingStyle: 'balanced',
    })

    expect(result.workspace).toEqual(WORKSPACE)
    expect(result.channels).toEqual(CHANNELS)
    expect(seedWorkspace).toHaveBeenCalledWith('ws-uuid', 'Acme', 'startup')
  })

  it('throws when workspace insert fails', async () => {
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'duplicate slug' } }),
    })

    const { createWorkspace } = await import('@/lib/auth')
    await expect(createWorkspace({
      userId: 'user-uuid', name: 'Acme', slug: 'acme', template: 'startup', workingStyle: 'balanced',
    })).rejects.toThrow('Failed to create workspace')
  })

  it('throws when user row insert fails', async () => {
    mockServiceFrom
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: WORKSPACE, error: null }),
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ data: null, error: { message: 'FK violation' } }),
      })

    const { createWorkspace } = await import('@/lib/auth')
    await expect(createWorkspace({
      userId: 'user-uuid', name: 'Acme', slug: 'acme', template: 'startup', workingStyle: 'balanced',
    })).rejects.toThrow('Failed to create user row')
  })
})

describe('getWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
  })

  it('returns null when user row not found', async () => {
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    const { getWorkspace } = await import('@/lib/auth')
    expect(await getWorkspace('user-uuid')).toBeNull()
  })

  it('returns workspace for known user', async () => {
    mockServiceFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { workspace_id: 'ws-uuid' }, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: WORKSPACE, error: null }),
      })

    const { getWorkspace } = await import('@/lib/auth')
    const result = await getWorkspace('user-uuid')
    expect(result).toEqual(WORKSPACE)
  })
})
