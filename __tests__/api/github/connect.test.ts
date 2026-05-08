import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockCookieSet = vi.hoisted(() => vi.fn())
const mockCookieGet = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
  createServiceClient: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: mockCookieSet,
    get: mockCookieGet,
    delete: vi.fn(),
  }),
}))

const USER = { id: 'user-1' }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.GITHUB_APP_SLUG = 'clan-bot'
  mockGetUser.mockResolvedValue({ data: { user: USER } })
})

describe('GET /api/github/connect', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { GET } = await import('@/app/api/github/connect/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 500 when GITHUB_APP_SLUG is not set', async () => {
    delete process.env.GITHUB_APP_SLUG
    const { GET } = await import('@/app/api/github/connect/route')
    const res = await GET()
    expect(res.status).toBe(500)
  })

  it('sets httpOnly state cookie and redirects to GitHub install URL', async () => {
    const { GET } = await import('@/app/api/github/connect/route')
    const res = await GET()
    expect(res.status).toBe(307)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('https://github.com/apps/clan-bot/installations/new')
    expect(location).toContain('state=')
    expect(mockCookieSet).toHaveBeenCalledWith(
      'github_oauth_state',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, maxAge: 600 })
    )
  })
})
