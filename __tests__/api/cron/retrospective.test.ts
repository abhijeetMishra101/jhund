import { describe, it, expect, vi, beforeEach } from 'vitest'

const CRON_SECRET = 'test-secret'

const mockRunRetrospective = vi.hoisted(() => vi.fn())
vi.mock('@/lib/crons/retrospective', () => ({ runRetrospective: mockRunRetrospective }))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

function makeReq(secret?: string) {
  return new Request('http://localhost/api/cron/retrospective', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

describe('GET /api/cron/retrospective', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env.CRON_SECRET = CRON_SECRET
  })

  it('returns 401 for missing secret', async () => {
    const { GET } = await import('@/app/api/cron/retrospective/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 401 for wrong secret', async () => {
    const { GET } = await import('@/app/api/cron/retrospective/route')
    const res = await GET(makeReq('bad'))
    expect(res.status).toBe(401)
  })

  it('returns 200 with workspaces count', async () => {
    mockRunRetrospective.mockResolvedValue({ workspaces: 2 })
    const { GET } = await import('@/app/api/cron/retrospective/route')
    const res = await GET(makeReq(CRON_SECRET))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, workspaces: 2 })
  })
})
