import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn().mockResolvedValue({ token: 'installation-token' }))
const mockGetInstallationOctokit = vi.hoisted(() => vi.fn().mockResolvedValue({ auth: mockAuth }))

vi.mock('@octokit/app', () => ({
  App: class MockApp {
    getInstallationOctokit = mockGetInstallationOctokit
  },
}))

const mockOctokitInstance = { auth: 'set' }
vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    constructor(opts: { auth: string }) {
      Object.assign(this, { _auth: opts.auth })
    }
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ token: 'installation-token' })
  mockGetInstallationOctokit.mockResolvedValue({ auth: mockAuth })
  process.env.GITHUB_APP_ID = 'test-app-id'
  process.env.GITHUB_APP_PRIVATE_KEY = 'test-private-key'
})

describe('getInstallationOctokit', () => {
  it('exchanges installation id for a token and returns Octokit instance', async () => {
    const { getInstallationOctokit } = await import('@/lib/github/auth')
    const octokit = await getInstallationOctokit(12345)
    expect(mockGetInstallationOctokit).toHaveBeenCalledWith(12345)
    expect(mockAuth).toHaveBeenCalledWith({ type: 'installation' })
    expect(octokit).toBeDefined()
  })

  it('passes the resolved token to the Octokit constructor', async () => {
    mockAuth.mockResolvedValue({ token: 'my-token-xyz' })
    const { getInstallationOctokit } = await import('@/lib/github/auth')
    const octokit = await getInstallationOctokit(99)
    expect((octokit as unknown as { _auth: string })._auth).toBe('my-token-xyz')
  })
})
