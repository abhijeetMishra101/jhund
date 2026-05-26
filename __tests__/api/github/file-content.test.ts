import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockGetUser = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))

// ── Octokit mock ──────────────────────────────────────────────────────────────
const mockGetContent = vi.hoisted(() => vi.fn())

vi.mock('@/lib/github/auth', () => ({
  getInstallationOctokit: vi.fn().mockResolvedValue({
    rest: {
      repos: { getContent: mockGetContent },
    },
  }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────
const VALID_URL = 'https://github.com/acme/myrepo/blob/main/docs/discussion.md'
const USER = { id: 'user-uuid' }
const WORKSPACE_ID = 'ws-uuid'
const INSTALLATION_ID = 42

function makeRequest(url?: string) {
  const base = 'http://localhost/api/github/file-content'
  const fullUrl = url !== undefined
    ? `${base}?url=${encodeURIComponent(url)}`
    : base
  return new Request(fullUrl)
}

function stubHappyPath(content = 'hello world') {
  mockGetUser.mockResolvedValue({ data: { user: USER } })

  mockServiceFrom.mockImplementation((table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: table === 'users'
        ? { workspace_id: WORKSPACE_ID }
        : { installation_id: INSTALLATION_ID },
      error: null,
    }),
  }))

  mockGetContent.mockResolvedValue({
    data: {
      type: 'file',
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/github/file-content', () => {
  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { GET } = await import('@/app/api/github/file-content/route')
    const res = await GET(makeRequest(VALID_URL) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 when url param is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } })
    const { GET } = await import('@/app/api/github/file-content/route')
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for a non-GitHub blob URL', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } })
    const { GET } = await import('@/app/api/github/file-content/route')
    const res = await GET(makeRequest('https://example.com/not-github') as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid/i)
  })

  it('returns 400 for a GitHub URL that is not a blob URL', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } })
    const { GET } = await import('@/app/api/github/file-content/route')
    const res = await GET(makeRequest('https://github.com/acme/repo') as never)
    expect(res.status).toBe(400)
  })

  it('returns 404 when no GitHub installation exists for the workspace', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } })

    mockServiceFrom.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: table === 'users' ? { workspace_id: WORKSPACE_ID } : null,
        error: null,
      }),
    }))

    const { GET } = await import('@/app/api/github/file-content/route')
    const res = await GET(makeRequest(VALID_URL) as never)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/installation/i)
  })

  it('returns 200 with decoded file content on success', async () => {
    stubHappyPath('# Hello\n\nThis is the document.')
    const { GET } = await import('@/app/api/github/file-content/route')
    const res = await GET(makeRequest(VALID_URL) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.content).toBe('# Hello\n\nThis is the document.')
  })

  it('correctly parses branch names with slashes (bot/docs-* branches)', async () => {
    // URL shape produced by document_discussion: bot/docs-{date}-{slug} branch
    const botBranchUrl = 'https://github.com/acme/myrepo/blob/bot/docs-2026-05-26-rate-limiting/docs/discussions/2026-05-26-rate-limiting.md'
    stubHappyPath('# Rate Limiting\n\nToken bucket approach.')
    const { GET } = await import('@/app/api/github/file-content/route')
    const res = await GET(makeRequest(botBranchUrl) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.content).toBe('# Rate Limiting\n\nToken bucket approach.')

    // Verify Octokit was called with the correct branch and path (not just 'bot')
    expect(mockGetContent).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: 'bot/docs-2026-05-26-rate-limiting',
        path: 'docs/discussions/2026-05-26-rate-limiting.md',
        owner: 'acme',
        repo: 'myrepo',
      })
    )
  })

  it('returns 404 when the file is not found on GitHub', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } })

    mockServiceFrom.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: table === 'users'
          ? { workspace_id: WORKSPACE_ID }
          : { installation_id: INSTALLATION_ID },
        error: null,
      }),
    }))

    mockGetContent.mockRejectedValue({ status: 404 })

    const { GET } = await import('@/app/api/github/file-content/route')
    const res = await GET(makeRequest(VALID_URL) as never)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/not found/i)
  })
})
