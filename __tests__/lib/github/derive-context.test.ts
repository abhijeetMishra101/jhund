import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Octokit } from '@octokit/rest'

// Helper to make a mock getContent response
function mockFile(content: string) {
  return {
    data: {
      type: 'file',
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    },
  }
}

function makeOctokit(overrides: Record<string, unknown> = {}): Octokit {
  return {
    rest: {
      repos: {
        getContent: vi.fn(),
        ...overrides,
      },
    },
  } as unknown as Octokit
}

describe('deriveWorkspaceContext', () => {
  beforeEach(() => vi.resetModules())

  it('returns null when README is missing', async () => {
    const octokit = makeOctokit()
    ;(octokit.rest.repos.getContent as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('Not Found'), { status: 404 })
    )

    const { deriveWorkspaceContext } = await import('@/lib/github/derive-context')
    const result = await deriveWorkspaceContext(octokit, 'owner', 'repo')
    expect(result).toBeNull()
  })

  it('returns context string when README exists', async () => {
    const octokit = makeOctokit()
    ;(octokit.rest.repos.getContent as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockFile('# My Project\nThis is a test project.'))  // README
      .mockRejectedValueOnce(new Error('Not Found'))  // package.json missing

    const { deriveWorkspaceContext } = await import('@/lib/github/derive-context')
    const result = await deriveWorkspaceContext(octokit, 'owner', 'myrepo')
    expect(result).not.toBeNull()
    expect(result).toContain('My Project')
    expect(result).toContain('owner/myrepo')
  })

  it('extracts project name and stack from package.json', async () => {
    const pkg = JSON.stringify({
      name: 'jhund',
      description: 'AI team workspace',
      dependencies: {
        next: '^14.0.0',
        '@supabase/supabase-js': '^2.0.0',
        '@anthropic-ai/sdk': '^0.20.0',
      },
    })

    const octokit = makeOctokit()
    ;(octokit.rest.repos.getContent as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockFile('# Jhund\nAn AI-team workspace.'))  // README
      .mockResolvedValueOnce(mockFile(pkg))  // package.json

    const { deriveWorkspaceContext } = await import('@/lib/github/derive-context')
    const result = await deriveWorkspaceContext(octokit, 'owner', 'jhund')
    expect(result).toContain('Project: jhund')
    expect(result).toContain('Next.js')
    expect(result).toContain('Supabase')
    expect(result).toContain('Anthropic Claude SDK')
  })

  it('works fine when package.json is missing', async () => {
    const octokit = makeOctokit()
    ;(octokit.rest.repos.getContent as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockFile('# My App\nA cool app.'))  // README
      .mockRejectedValueOnce(new Error('Not Found'))  // no package.json

    const { deriveWorkspaceContext } = await import('@/lib/github/derive-context')
    const result = await deriveWorkspaceContext(octokit, 'acme', 'my-app')
    expect(result).not.toBeNull()
    expect(result).toContain('My App')
    // Falls back to repo name as project name
    expect(result).toContain('acme/my-app')
  })

  it('caps output at 3000 chars', async () => {
    const longReadme = 'x'.repeat(5000)
    const octokit = makeOctokit()
    ;(octokit.rest.repos.getContent as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockFile(longReadme))
      .mockRejectedValueOnce(new Error('Not Found'))

    const { deriveWorkspaceContext } = await import('@/lib/github/derive-context')
    const result = await deriveWorkspaceContext(octokit, 'owner', 'repo')
    expect(result).not.toBeNull()
    expect(result!.length).toBeLessThanOrEqual(3000)
  })

  it('includes repo name in output', async () => {
    const octokit = makeOctokit()
    ;(octokit.rest.repos.getContent as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockFile('# Test'))
      .mockRejectedValueOnce(new Error('Not Found'))

    const { deriveWorkspaceContext } = await import('@/lib/github/derive-context')
    const result = await deriveWorkspaceContext(octokit, 'myorg', 'myrepo')
    expect(result).toContain('myorg/myrepo')
  })

  it('returns null (does not throw) on unexpected errors', async () => {
    const octokit = makeOctokit()
    ;(octokit.rest.repos.getContent as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error')
    )

    const { deriveWorkspaceContext } = await import('@/lib/github/derive-context')
    await expect(deriveWorkspaceContext(octokit, 'owner', 'repo')).resolves.toBeNull()
  })
})
