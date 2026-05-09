import { describe, it, expect, vi, beforeEach } from 'vitest'

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'ws-uuid'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

function makeReq(body: object) {
  return new Request('http://localhost/api/workspace/update', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function userChain(workspaceId: string | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: workspaceId ? { workspace_id: workspaceId } : null }),
  }
}

function updateChain(data: unknown) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error: data ? null : 'error' }),
        }),
      }),
    }),
  }
}

describe('PATCH /api/workspace/update', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockServiceFrom.mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('@/app/api/workspace/update/route')
    const res = await PATCH(makeReq({ name: 'Test' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when neither name nor workingStyle provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const { PATCH } = await import('@/app/api/workspace/update/route')
    const res = await PATCH(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when name is empty string', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const { PATCH } = await import('@/app/api/workspace/update/route')
    const res = await PATCH(makeReq({ name: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when name exceeds 64 chars', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const { PATCH } = await import('@/app/api/workspace/update/route')
    const res = await PATCH(makeReq({ name: 'A'.repeat(65) }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when workingStyle is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const { PATCH } = await import('@/app/api/workspace/update/route')
    const res = await PATCH(makeReq({ workingStyle: 'invalid-style' }))
    expect(res.status).toBe(400)
  })

  it('updates workspace name successfully', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const updated = { id: WORKSPACE_ID, name: 'New Name', working_style: 'balanced' }

    mockServiceFrom
      .mockReturnValueOnce(userChain(WORKSPACE_ID))
      .mockReturnValueOnce(updateChain(updated))

    const { PATCH } = await import('@/app/api/workspace/update/route')
    const res = await PATCH(makeReq({ name: 'New Name' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.workspace.name).toBe('New Name')
  })

  it('updates workingStyle successfully', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const updated = { id: WORKSPACE_ID, name: 'Acme', working_style: 'hands-on' }

    mockServiceFrom
      .mockReturnValueOnce(userChain(WORKSPACE_ID))
      .mockReturnValueOnce(updateChain(updated))

    const { PATCH } = await import('@/app/api/workspace/update/route')
    const res = await PATCH(makeReq({ workingStyle: 'hands-on' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.workspace.working_style).toBe('hands-on')
  })

  it('accepts all three valid working styles', async () => {
    const styles = ['hands-off', 'balanced', 'hands-on'] as const
    for (const style of styles) {
      vi.resetModules()
      mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
      mockServiceFrom.mockReset()
      mockServiceFrom
        .mockReturnValueOnce(userChain(WORKSPACE_ID))
        .mockReturnValueOnce(updateChain({ id: WORKSPACE_ID, name: 'Acme', working_style: style }))

      const { PATCH } = await import('@/app/api/workspace/update/route')
      const res = await PATCH(makeReq({ workingStyle: style }))
      expect(res.status).toBe(200)
    }
  })
})
