/**
 * Tests for commitDiscussionDoc()
 *
 * UC-19-04: happy path — commits doc to GitHub when installation is connected
 * UC-19-05: no GitHub installation → returns { committed: false }
 * UC-19-05: pending installation → returns { committed: false }
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())
const mockGetInstallationOctokit = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockFrom }),
}))

vi.mock('@/lib/github/auth', () => ({
  getInstallationOctokit: mockGetInstallationOctokit,
}))

/** Build a mock Octokit instance with the methods commitDiscussionDoc uses */
function makeOctokit({
  defaultBranch = 'main',
  fileExists = false,
  htmlUrl = 'https://github.com/owner/repo/blob/bot/docs-2026-05-26-rate-limiting-strategy/docs/discussions/2026-05-26-rate-limiting-strategy.md',
}: {
  defaultBranch?: string
  fileExists?: boolean
  htmlUrl?: string
} = {}) {
  const getContent = fileExists
    ? vi.fn().mockResolvedValue({ data: { type: 'file', sha: 'abc123' } })
    : vi.fn().mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))

  const createOrUpdateFileContents = vi.fn().mockResolvedValue({
    data: { content: { html_url: htmlUrl } },
  })

  const createRef = vi.fn().mockResolvedValue({ data: {} })
  const getRef = vi.fn().mockResolvedValue({ data: { object: { sha: 'base-sha-123' } } })

  return {
    rest: {
      repos: {
        get: vi.fn().mockResolvedValue({ data: { default_branch: defaultBranch } }),
        getContent,
        createOrUpdateFileContents,
      },
      git: {
        getRef,
        createRef,
      },
    },
    _createOrUpdateFileContents: createOrUpdateFileContents,
    _getContent: getContent,
    _createRef: createRef,
    _getRef: getRef,
  }
}

/** Build a Supabase `.from('github_installations')` chain */
function installationChain(data: Record<string, unknown> | null, isEmpty = false) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(
          isEmpty ? { data: null, error: null } : { data, error: null }
        ),
      }),
    }),
  }
}

const PARAMS = {
  workspaceId: 'ws-1',
  title: 'Rate Limiting Strategy',
  summary: 'We agreed to use a token-bucket approach at the API gateway.',
}

describe('commitDiscussionDoc', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
    mockGetInstallationOctokit.mockReset()
  })

  it('UC-19-04: happy path — calls createOrUpdateFileContents and returns committed:true', async () => {
    const octokit = makeOctokit()
    mockGetInstallationOctokit.mockResolvedValue(octokit)
    mockFrom.mockReturnValueOnce(
      installationChain({ installation_id: 42, repo_full_name: 'owner/repo' })
    )

    const { commitDiscussionDoc } = await import('@/lib/decisions/github-commit')
    const result = await commitDiscussionDoc(PARAMS)

    // Should return committed: true
    expect(result.committed).toBe(true)
    expect(result.path).toMatch(/^docs\/discussions\/\d{4}-\d{2}-\d{2}-rate-limiting-strategy\.md$/)
    expect(result.url).toBeDefined()

    // createOrUpdateFileContents must have been called once
    expect(octokit._createOrUpdateFileContents).toHaveBeenCalledOnce()

    const callArg = octokit._createOrUpdateFileContents.mock.calls[0][0]

    // Path matches the expected pattern
    expect(callArg.path).toMatch(/^docs\/discussions\/\d{4}-\d{2}-\d{2}-rate-limiting-strategy\.md$/)

    // Content is base64 and decodes to start with '# Rate Limiting Strategy'
    const decoded = Buffer.from(callArg.content, 'base64').toString('utf8')
    expect(decoded).toMatch(/^# Rate Limiting Strategy/)

    // Commit message contains the title
    expect(callArg.message).toContain('Rate Limiting Strategy')

    // Must commit to a bot/ branch, NOT main (main is protected)
    expect(callArg.branch).toMatch(/^bot\/docs-/)

    // Correct owner/repo
    expect(callArg.owner).toBe('owner')
    expect(callArg.repo).toBe('repo')
  })

  it('UC-19-04b: includes sha when file already exists (idempotent update)', async () => {
    const octokit = makeOctokit({ fileExists: true })
    mockGetInstallationOctokit.mockResolvedValue(octokit)
    mockFrom.mockReturnValueOnce(
      installationChain({ installation_id: 42, repo_full_name: 'owner/repo' })
    )

    const { commitDiscussionDoc } = await import('@/lib/decisions/github-commit')
    await commitDiscussionDoc(PARAMS)

    const callArg = octokit._createOrUpdateFileContents.mock.calls[0][0]
    expect(callArg.sha).toBe('abc123')
  })

  it('UC-19-05: no installation row → returns committed:false without calling Octokit', async () => {
    mockFrom.mockReturnValueOnce(installationChain(null, true))

    const { commitDiscussionDoc } = await import('@/lib/decisions/github-commit')
    const result = await commitDiscussionDoc(PARAMS)

    expect(result).toEqual({ committed: false })
    expect(mockGetInstallationOctokit).not.toHaveBeenCalled()
  })

  it('UC-19-05: pending installation → returns committed:false without calling Octokit', async () => {
    mockFrom.mockReturnValueOnce(
      installationChain({ installation_id: 42, repo_full_name: 'pending' })
    )

    const { commitDiscussionDoc } = await import('@/lib/decisions/github-commit')
    const result = await commitDiscussionDoc(PARAMS)

    expect(result).toEqual({ committed: false })
    expect(mockGetInstallationOctokit).not.toHaveBeenCalled()
  })
})
