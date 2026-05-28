import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Octokit mock ──────────────────────────────────────────────────────────────
const mockReposGet = vi.hoisted(() => vi.fn())
const mockReposGetContent = vi.hoisted(() => vi.fn())

const mockOctokit = {
  rest: {
    repos: {
      get: mockReposGet,
      getContent: mockReposGetContent,
    },
  },
}

vi.mock('@/lib/github/auth', () => ({
  getInstallationOctokit: vi.fn().mockResolvedValue(mockOctokit),
}))

// ── Supabase mock ──────────────────────────────────────────────────────────────
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────
const WORKSPACE_ID = 'workspace-uuid'
const INSTALLATION_ID = '12345'
const REPO = 'owner/myrepo'

function installationChain(repoFullName = REPO) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { installation_id: INSTALLATION_ID, repo_full_name: repoFullName },
      error: null,
    }),
  }
}

function noInstallationChain() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

/** Encodes a string as base64 (same as GitHub API returns) */
function b64(s: string): string {
  return Buffer.from(s).toString('base64')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockServiceFrom.mockReset()
  // Default: repo default branch is 'main'
  mockReposGet.mockResolvedValue({ data: { default_branch: 'main' } })
})

describe('readGithubFile', () => {
  it('happy path — returns decoded content, sha, truncated: false', async () => {
    const rawContent = 'import fastapi\nclass Collector: pass'
    mockServiceFrom.mockReturnValueOnce(installationChain())
    mockReposGetContent.mockResolvedValueOnce({
      data: { type: 'file', content: b64(rawContent), sha: 'abc123' },
    })

    const { readGithubFile } = await import('@/lib/github/reader')
    const result = await readGithubFile(WORKSPACE_ID, 'src/m1/collector.py')

    expect(result.content).toBe(rawContent)
    expect(result.sha).toBe('abc123')
    expect(result.truncated).toBe(false)
  })

  it('truncates content > 8000 chars and sets truncated: true', async () => {
    const longContent = 'x'.repeat(9000)
    mockServiceFrom.mockReturnValueOnce(installationChain())
    mockReposGetContent.mockResolvedValueOnce({
      data: { type: 'file', content: b64(longContent), sha: 'sha-trunc' },
    })

    const { readGithubFile } = await import('@/lib/github/reader')
    const result = await readGithubFile(WORKSPACE_ID, 'big-file.txt')

    expect(result.content.length).toBe(8000)
    expect(result.truncated).toBe(true)
    expect(result.sha).toBe('sha-trunc')
  })

  it('throws FileNotFoundError on 404 from getContent', async () => {
    mockServiceFrom.mockReturnValueOnce(installationChain())
    mockReposGetContent.mockRejectedValueOnce(
      Object.assign(new Error('Not Found'), { status: 404 })
    )

    const { readGithubFile, FileNotFoundError } = await import('@/lib/github/reader')
    await expect(readGithubFile(WORKSPACE_ID, 'missing.py')).rejects.toThrow(FileNotFoundError)
  })

  it('throws FileAccessDeniedError on 403 from getContent', async () => {
    mockServiceFrom.mockReturnValueOnce(installationChain())
    mockReposGetContent.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { status: 403 })
    )

    const { readGithubFile, FileAccessDeniedError } = await import('@/lib/github/reader')
    await expect(readGithubFile(WORKSPACE_ID, 'secret.txt')).rejects.toThrow(FileAccessDeniedError)
  })

  it('throws NoGithubInstallationError when no installation found', async () => {
    mockServiceFrom.mockReturnValueOnce(noInstallationChain())

    const { readGithubFile, NoGithubInstallationError } = await import('@/lib/github/reader')
    await expect(readGithubFile(WORKSPACE_ID, 'any.py')).rejects.toThrow(NoGithubInstallationError)
  })

  it('throws NoGithubInstallationError when repo_full_name is "pending"', async () => {
    mockServiceFrom.mockReturnValueOnce(installationChain('pending'))

    const { readGithubFile, NoGithubInstallationError } = await import('@/lib/github/reader')
    await expect(readGithubFile(WORKSPACE_ID, 'any.py')).rejects.toThrow(NoGithubInstallationError)
  })

  it('uses default branch when branch param is omitted', async () => {
    const { getInstallationOctokit } = await import('@/lib/github/auth')
    mockServiceFrom.mockReturnValueOnce(installationChain())
    mockReposGet.mockResolvedValueOnce({ data: { default_branch: 'develop' } })
    mockReposGetContent.mockResolvedValueOnce({
      data: { type: 'file', content: b64('code'), sha: 'sha1' },
    })

    const { readGithubFile } = await import('@/lib/github/reader')
    await readGithubFile(WORKSPACE_ID, 'src/app.ts')

    expect(getInstallationOctokit).toHaveBeenCalledWith(Number(INSTALLATION_ID))
    expect(mockReposGet).toHaveBeenCalledWith({ owner: 'owner', repo: 'myrepo' })
    expect(mockReposGetContent).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'develop' })
    )
  })

  it('uses provided branch when given (skips repos.get)', async () => {
    mockServiceFrom.mockReturnValueOnce(installationChain())
    mockReposGetContent.mockResolvedValueOnce({
      data: { type: 'file', content: b64('feature code'), sha: 'sha2' },
    })

    const { readGithubFile } = await import('@/lib/github/reader')
    await readGithubFile(WORKSPACE_ID, 'src/app.ts', 'feat/my-branch')

    // repos.get should NOT have been called — branch was provided
    expect(mockReposGet).not.toHaveBeenCalled()
    expect(mockReposGetContent).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'feat/my-branch' })
    )
  })

  it('rethrows unexpected errors from getContent (not 404/403)', async () => {
    mockServiceFrom.mockReturnValueOnce(installationChain())
    const networkErr = Object.assign(new Error('Network timeout'), { status: 503 })
    mockReposGetContent.mockRejectedValueOnce(networkErr)

    const { readGithubFile } = await import('@/lib/github/reader')
    await expect(readGithubFile(WORKSPACE_ID, 'src/app.ts')).rejects.toThrow('Network timeout')
  })

  it('throws FileNotFoundError when path resolves to a directory', async () => {
    mockServiceFrom.mockReturnValueOnce(installationChain())
    // GitHub returns an array when the path is a directory
    mockReposGetContent.mockResolvedValueOnce({ data: [{ name: 'file.py', type: 'file' }] })

    const { readGithubFile, FileNotFoundError } = await import('@/lib/github/reader')
    await expect(readGithubFile(WORKSPACE_ID, 'src/')).rejects.toThrow(FileNotFoundError)
  })
})
