import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateWorkspace = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>()
  return {
    ...actual,
    createWorkspace: mockCreateWorkspace,
  }
})

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'workspace-uuid'
const WORKSPACE = { id: WORKSPACE_ID, name: 'Acme', slug: 'acme', template: 'startup', action_cap: 50, actions_used: 5, working_style: 'balanced', github_installation_id: null, github_repo: null, created_at: '2024-01-01T00:00:00Z' }

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

describe('GET /api/workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
  })

  it('returns workspace and action counter', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    let callIdx = 0
    mockFrom.mockImplementation(() => {
      callIdx++
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockResolvedValue({
        data: callIdx === 1 ? { workspace_id: WORKSPACE_ID } : WORKSPACE,
        error: null,
      })
      return chain
    })

    const { GET } = await import('@/app/api/workspace/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.workspace).toEqual(WORKSPACE)
    expect(body.actionCounter).toEqual({ used: 5, cap: 50 })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { GET } = await import('@/app/api/workspace/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 404 when user has no workspace', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { workspace_id: null }, error: null }),
    })
    const { GET } = await import('@/app/api/workspace/route')
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('returns 404 when workspace row fetch fails with a DB error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    let callIdx = 0
    mockFrom.mockImplementation(() => {
      callIdx++
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockResolvedValue(
        callIdx === 1
          ? { data: { workspace_id: WORKSPACE_ID }, error: null }
          : { data: null, error: { message: 'connection error' } }
      )
      return chain
    })
    const { GET } = await import('@/app/api/workspace/route')
    const res = await GET()
    expect(res.status).toBe(404)
  })
})

describe('POST /api/workspace/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/workspace/setup/route')
    const req = new Request('http://localhost/api/workspace/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme', template: 'startup', workingStyle: 'balanced' }),
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const { POST } = await import('@/app/api/workspace/setup/route')
    const req = new Request('http://localhost/api/workspace/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid template', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    const { POST } = await import('@/app/api/workspace/setup/route')
    const req = new Request('http://localhost/api/workspace/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme', template: 'invalid', workingStyle: 'balanced' }),
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
  })

  it('returns 409 when workspace already exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null }),
    })
    const { POST } = await import('@/app/api/workspace/setup/route')
    const req = new Request('http://localhost/api/workspace/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme', template: 'startup', workingStyle: 'balanced' }),
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(409)
  })

  it('returns 400 when name is blank', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const { POST } = await import('@/app/api/workspace/setup/route')
    const req = new Request('http://localhost/api/workspace/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ', template: 'startup', workingStyle: 'balanced' }),
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid workingStyle', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const { POST } = await import('@/app/api/workspace/setup/route')
    const req = new Request('http://localhost/api/workspace/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme', template: 'startup', workingStyle: 'turbo' }),
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
  })

  it('returns 500 when createWorkspace throws', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { workspace_id: null }, error: null }),
    })
    mockCreateWorkspace.mockRejectedValueOnce(new Error('DB constraint violation'))
    const { POST } = await import('@/app/api/workspace/setup/route')
    const req = new Request('http://localhost/api/workspace/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme', template: 'startup', workingStyle: 'balanced' }),
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('DB constraint violation')
  })
})
