import { describe, it, expect, vi, beforeEach } from 'vitest'

const CRON_SECRET = 'test-secret'

const mockArchiveOldMessages = vi.hoisted(() => vi.fn())
vi.mock('@/lib/crons/archive', () => ({ archiveOldMessages: mockArchiveOldMessages }))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

function makeReq(secret?: string) {
  return new Request('http://localhost/api/cron/archive-messages', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

describe('GET /api/cron/archive-messages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env.CRON_SECRET = CRON_SECRET
  })

  it('returns 401 for missing secret', async () => {
    const { GET } = await import('@/app/api/cron/archive-messages/route')
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 401 for wrong secret', async () => {
    const { GET } = await import('@/app/api/cron/archive-messages/route')
    const res = await GET(makeReq('wrong'))
    expect(res.status).toBe(401)
  })

  it('returns 200 with archived count on success', async () => {
    mockArchiveOldMessages.mockResolvedValue({ archived: 1500, workspaces: 5 })
    const { GET } = await import('@/app/api/cron/archive-messages/route')
    const res = await GET(makeReq(CRON_SECRET))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, archived: 1500, workspaces: 5 })
  })

  it('returns archived: 0 when no old messages exist', async () => {
    mockArchiveOldMessages.mockResolvedValue({ archived: 0, workspaces: 2 })
    const { GET } = await import('@/app/api/cron/archive-messages/route')
    const res = await GET(makeReq(CRON_SECRET))
    expect(await res.json()).toMatchObject({ archived: 0 })
  })
})
