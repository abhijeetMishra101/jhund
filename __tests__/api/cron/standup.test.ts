import { describe, it, expect, vi, beforeEach } from 'vitest'

const CRON_SECRET = 'test-secret'

const mockRunStandup = vi.hoisted(() => vi.fn())
vi.mock('@/lib/crons/standup', () => ({ runStandup: mockRunStandup }))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

function makeReq(secret?: string) {
  return new Request('http://localhost/api/cron/standup', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

describe('GET /api/cron/standup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env.CRON_SECRET = CRON_SECRET
  })

  it('returns 401 when Authorization header is missing', async () => {
    const { GET } = await import('@/app/api/cron/standup/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 401 when secret is wrong', async () => {
    const { GET } = await import('@/app/api/cron/standup/route')
    const res = await GET(makeReq('wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns 200 with workspaces count on success', async () => {
    mockRunStandup.mockResolvedValue({ workspaces: 3 })
    const { GET } = await import('@/app/api/cron/standup/route')
    const res = await GET(makeReq(CRON_SECRET))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, workspaces: 3 })
  })

  it('calls runStandup once per invocation', async () => {
    mockRunStandup.mockResolvedValue({ workspaces: 1 })
    const { GET } = await import('@/app/api/cron/standup/route')
    await GET(makeReq(CRON_SECRET))
    expect(mockRunStandup).toHaveBeenCalledOnce()
  })
})
