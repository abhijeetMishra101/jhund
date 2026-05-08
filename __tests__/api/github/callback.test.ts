import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockCookieGet = vi.hoisted(() => vi.fn())
const mockCookieDelete = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())
const mockListRepos = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: mockCookieGet,
    set: vi.fn(),
    delete: mockCookieDelete,
  }),
}))

vi.mock('@/lib/github/auth', () => ({
  getInstallationOctokit: vi.fn().mockResolvedValue({
    rest: {
      apps: { listReposAccessibleToInstallation: mockListRepos },
    },
  }),
}))

const USER = { id: 'user-1' }
const WORKSPACE_ID = 'ws-uuid'
const INSTALLATION_ID = '126817959'
const STATE = 'test-state-uuid'

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/github/callback')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString())
}

function stubSupabase(repoName = 'owner/repo') {
  mockListRepos.mockResolvedValue({ data: { repositories: [{ full_name: repoName }] } })
  mockServiceFrom.mockImplementation((table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    single: vi.fn().mockResolvedValue({
      data: table === 'users'
        ? { workspace_id: WORKSPACE_ID }
        : { slug: 'acme' },
      error: null,
    }),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: USER } })
  mockCookieGet.mockReturnValue({ value: STATE })
  stubSupabase()
})

describe('GET /api/github/callback', () => {
  it('redirects to /onboarding?github_error=1 when state is missing', async () => {
    mockCookieGet.mockReturnValue(undefined)
    const { GET } = await import('@/app/api/github/callback/route')
    const res = await GET(makeRequest({ installation_id: INSTALLATION_ID, state: STATE }))
    expect(res.headers.get('location')).toContain('github_error=1')
  })

  it('redirects to /onboarding?github_error=1 when state does not match', async () => {
    const { GET } = await import('@/app/api/github/callback/route')
    const res = await GET(makeRequest({ installation_id: INSTALLATION_ID, state: 'wrong-state' }))
    expect(res.headers.get('location')).toContain('github_error=1')
  })

  it('redirects to /onboarding?github_error=1 when installation_id is missing', async () => {
    const { GET } = await import('@/app/api/github/callback/route')
    const res = await GET(makeRequest({ state: STATE }))
    expect(res.headers.get('location')).toContain('github_error=1')
  })

  it('redirects to /auth/login when user is unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { GET } = await import('@/app/api/github/callback/route')
    const res = await GET(makeRequest({ installation_id: INSTALLATION_ID, state: STATE }))
    expect(res.headers.get('location')).toContain('/auth/login')
  })

  it('resolves repo name from GitHub API and upserts installation row', async () => {
    const { GET } = await import('@/app/api/github/callback/route')
    await GET(makeRequest({ installation_id: INSTALLATION_ID, state: STATE }))
    expect(mockListRepos).toHaveBeenCalledWith({ per_page: 1 })
  })

  it('redirects to workspace with github_connected=1 on success', async () => {
    const { GET } = await import('@/app/api/github/callback/route')
    const res = await GET(makeRequest({ installation_id: INSTALLATION_ID, state: STATE }))
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/w/acme')
    expect(location).toContain('github_connected=1')
  })

  it('falls back to pending when no repos are accessible', async () => {
    mockListRepos.mockResolvedValue({ data: { repositories: [] } })
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    mockServiceFrom.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      upsert: upsertMock,
      single: vi.fn().mockResolvedValue({
        data: table === 'users' ? { workspace_id: WORKSPACE_ID } : { slug: 'acme' },
        error: null,
      }),
    }))
    const { GET } = await import('@/app/api/github/callback/route')
    await GET(makeRequest({ installation_id: INSTALLATION_ID, state: STATE }))
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ repo_full_name: 'pending' }),
      expect.anything()
    )
  })

  it('clears the state cookie on success', async () => {
    const { GET } = await import('@/app/api/github/callback/route')
    await GET(makeRequest({ installation_id: INSTALLATION_ID, state: STATE }))
    expect(mockCookieDelete).toHaveBeenCalledWith('github_oauth_state')
  })
})
