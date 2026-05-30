import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Octokit mock ─────────────────────────────────────────────────────────────
const mockIssuesCreate = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockIssuesCreateComment = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockPullsCreate = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockGitGetRef = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { object: { sha: 'abc123' } } }))
const mockGitCreateRef = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockGitListMatchingRefs = vi.hoisted(() => vi.fn().mockResolvedValue({ data: [] }))
const mockReposGet = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { default_branch: 'main' } }))
const mockReposGetContent = vi.hoisted(() => vi.fn())
const mockReposCreateOrUpdateFileContents = vi.hoisted(() => vi.fn().mockResolvedValue({}))

const mockOctokit = {
  rest: {
    issues: { create: mockIssuesCreate, createComment: mockIssuesCreateComment },
    pulls: { create: mockPullsCreate },
    git: { getRef: mockGitGetRef, createRef: mockGitCreateRef, listMatchingRefs: mockGitListMatchingRefs },
    repos: {
      get: mockReposGet,
      getContent: mockReposGetContent,
      createOrUpdateFileContents: mockReposCreateOrUpdateFileContents,
    },
  },
}

vi.mock('@/lib/github/auth', () => ({
  getInstallationOctokit: vi.fn().mockResolvedValue(mockOctokit),
}))

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockServiceFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn().mockResolvedValue({ data: true, error: null }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom, rpc: mockRpc }),
}))

const PLAN_ID = 'plan-uuid'
const WORKSPACE_ID = 'workspace-uuid'
const INSTALLATION_ID = '12345'
const REPO = 'owner/repo'

// Simulates the atomic claim: update().eq().eq().select().single()
function planChain(actions: unknown[], channelId = 'ch-test') {
  const single = vi.fn().mockResolvedValue({ data: { github_actions: actions, channel_id: channelId }, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const innerEq = vi.fn().mockReturnValue({ select })
  const outerEq = vi.fn().mockReturnValue({ eq: innerEq })
  const update = vi.fn().mockReturnValue({ eq: outerEq })
  return { update }
}

function installationChain() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { installation_id: INSTALLATION_ID, repo_full_name: REPO }, error: null }),
  }
}

function updateChain() {
  return {
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

function workspaceChain(actionsUsed = 10, actionCap = 50) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { actions_used: actionsUsed, action_cap: actionCap }, error: null }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockServiceFrom.mockReset()
  mockRpc.mockResolvedValue({ data: true, error: null })
})

describe('executePlanActions', () => {
  it('returns early without throwing when plan cannot be claimed (already executing/executed)', async () => {
    // Claim returns null — plan already in non-approved state
    const single = vi.fn().mockResolvedValue({ data: null, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const innerEq = vi.fn().mockReturnValue({ select })
    const outerEq = vi.fn().mockReturnValue({ eq: innerEq })
    mockServiceFrom.mockReturnValueOnce({ update: vi.fn().mockReturnValue({ eq: outerEq }) })

    const { executePlanActions } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).resolves.toBeUndefined()
  })

  it('throws when no GitHub installation is linked', async () => {
    mockServiceFrom
      .mockReturnValueOnce(planChain([]))
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })
    const { executePlanActions } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).rejects.toThrow('No GitHub installation')
  })

  it('calls issues.create for create_issue action', async () => {
    const actions = [{ action_type: 'create_issue', payload: { title: 'Bug', body: 'desc', labels: ['bug'] } }]
    mockServiceFrom
      .mockReturnValueOnce(planChain(actions))
      .mockReturnValueOnce(installationChain())
      .mockReturnValueOnce(workspaceChain())
      .mockReturnValueOnce(updateChain()) // status update

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    expect(mockIssuesCreate).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      title: 'Bug',
      body: 'desc',
      labels: ['bug'],
    })
  })

  it('calls issues.createComment for comment_issue action', async () => {
    const actions = [{ action_type: 'comment_issue', payload: { issue_number: 7, body: 'looks good' } }]
    mockServiceFrom
      .mockReturnValueOnce(planChain(actions))
      .mockReturnValueOnce(installationChain())
      .mockReturnValueOnce(workspaceChain())
      .mockReturnValueOnce(updateChain())

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    expect(mockIssuesCreateComment).toHaveBeenCalledWith({
      owner: 'owner', repo: 'repo', issue_number: 7, body: 'looks good',
    })
  })

  it('calls issues.createComment for comment_pr action', async () => {
    const actions = [{ action_type: 'comment_pr', payload: { pr_number: 42, body: 'LGTM' } }]
    mockServiceFrom
      .mockReturnValueOnce(planChain(actions))
      .mockReturnValueOnce(installationChain())
      .mockReturnValueOnce(workspaceChain())
      .mockReturnValueOnce(updateChain())

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    expect(mockIssuesCreateComment).toHaveBeenCalledWith({
      owner: 'owner', repo: 'repo', issue_number: 42, body: 'LGTM',
    })
  })

  it('calls pulls.create and git.createRef for create_pr action', async () => {
    const actions = [{
      action_type: 'create_pr',
      payload: { title: 'New PR', body: 'desc', head_branch: 'feat/x', base_branch: 'main' },
    }]
    mockServiceFrom
      .mockReturnValueOnce(planChain(actions))
      .mockReturnValueOnce(installationChain())
      .mockReturnValueOnce(workspaceChain())
      .mockReturnValueOnce(updateChain())

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    expect(mockGitGetRef).toHaveBeenCalled()
    expect(mockPullsCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: 'New PR', head: 'feat/x', base: 'main',
    }))
  })

  it('create_issue: when labels is not an array, passes empty array to issues.create', async () => {
    const actions = [{ action_type: 'create_issue', payload: { title: 'Bug', body: 'desc', labels: 'bug' } }]
    mockServiceFrom
      .mockReturnValueOnce(planChain(actions))
      .mockReturnValueOnce(installationChain())
      .mockReturnValueOnce(workspaceChain())
      .mockReturnValueOnce(updateChain())

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    expect(mockIssuesCreate).toHaveBeenCalledWith(expect.objectContaining({
      labels: [],
    }))
  })

  it('create_pr: swallows createRef error and still calls pulls.create', async () => {
    mockGitCreateRef.mockRejectedValueOnce(new Error('Reference already exists'))

    const actions = [{
      action_type: 'create_pr',
      payload: { title: 'New PR', body: 'desc', head_branch: 'feat/x', base_branch: 'main' },
    }]
    mockServiceFrom
      .mockReturnValueOnce(planChain(actions))
      .mockReturnValueOnce(installationChain())
      .mockReturnValueOnce(workspaceChain())
      .mockReturnValueOnce(updateChain())

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    expect(mockGitCreateRef).toHaveBeenCalled()
    expect(mockPullsCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: 'New PR',
      head: 'feat/x',
      base: 'main',
    }))
  })

  it('marks plan as executed after successful actions', async () => {
    const actions = [{ action_type: 'create_issue', payload: { title: 'Test', body: '', labels: [] } }]
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })

    let fromCallIdx = 0
    mockServiceFrom.mockImplementation(() => {
      fromCallIdx++
      if (fromCallIdx === 1) return planChain(actions)  // claim
      if (fromCallIdx === 2) return installationChain()
      if (fromCallIdx === 3) return workspaceChain()
      return { update: mockUpdate, select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'executed' }))
  })

  it('sets plan to failed and rethrows plain-English error when GitHub returns 403', async () => {
    const githubError = Object.assign(new Error('Forbidden'), { status: 403 })
    mockIssuesCreateComment.mockRejectedValueOnce(githubError)

    const actions = [{ action_type: 'comment_pr', payload: { pr_number: 1, body: 'review' } }]
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })

    let fromCallIdx = 0
    mockServiceFrom.mockImplementation(() => {
      fromCallIdx++
      if (fromCallIdx === 1) return planChain(actions, 'ch-test')  // claim
      if (fromCallIdx === 2) return installationChain()
      if (fromCallIdx === 3) return workspaceChain()
      return { update: mockUpdate }
    })

    const { executePlanActions } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).rejects.toThrow('permissions')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', failure_reason: expect.stringContaining('permissions') }))
  })

  it('sets plan to failed with 404 message and rethrows when GitHub returns 404', async () => {
    const githubError = Object.assign(new Error('Not Found'), { status: 404 })
    mockGitGetRef.mockRejectedValueOnce(githubError)

    const actions = [{ action_type: 'create_pr', payload: { title: 'PR', body: '', head_branch: 'feat/x', base_branch: 'main' } }]
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })

    let fromCallIdx = 0
    mockServiceFrom.mockImplementation(() => {
      fromCallIdx++
      if (fromCallIdx === 1) return planChain(actions)  // claim
      if (fromCallIdx === 2) return installationChain()
      if (fromCallIdx === 3) return workspaceChain()
      return { update: mockUpdate }
    })

    const { executePlanActions } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).rejects.toThrow("couldn't be found")
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('throws ActionCapExceededError when increment_action_count returns false', async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null })
    mockServiceFrom
      .mockReturnValueOnce(planChain([]))
      .mockReturnValueOnce(installationChain())
    const { executePlanActions, ActionCapExceededError } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).rejects.toThrow(ActionCapExceededError)
  })

  it('posts 80% warning system message when actions_used/action_cap is in 80-89% band', async () => {
    const actions = [{ action_type: 'create_issue', payload: { title: 'Test', body: '', labels: [] } }]
    const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null })

    mockServiceFrom
      .mockReturnValueOnce(planChain(actions, 'ch-test'))
      .mockReturnValueOnce(installationChain())
      .mockReturnValueOnce(workspaceChain(40, 50)) // 80% exactly
      .mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
        insert: mockInsert,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      author_type: 'system',
      content: expect.stringContaining('80%'),
    }))
  })

  it('does NOT post 80% warning when below 80%', async () => {
    const actions = [{ action_type: 'create_issue', payload: { title: 'Test', body: '', labels: [] } }]
    const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null })

    mockServiceFrom
      .mockReturnValueOnce(planChain(actions))
      .mockReturnValueOnce(installationChain())
      .mockReturnValueOnce(workspaceChain(30, 50)) // 60%
      .mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
        insert: mockInsert,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('does NOT post 80% warning when at 90% or above (to avoid spam)', async () => {
    const actions = [{ action_type: 'create_issue', payload: { title: 'Test', body: '', labels: [] } }]
    const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null })

    mockServiceFrom
      .mockReturnValueOnce(planChain(actions))
      .mockReturnValueOnce(installationChain())
      .mockReturnValueOnce(workspaceChain(45, 50)) // 90%
      .mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
        insert: mockInsert,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('throws when repo_full_name is pending', async () => {
    mockServiceFrom
      .mockReturnValueOnce(planChain([]))
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { installation_id: '123', repo_full_name: 'pending' }, error: null }),
      })
    const { executePlanActions } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).rejects.toThrow('repo not yet connected')
  })

  it('uses generic error message for unknown error status and rethrows', async () => {
    mockIssuesCreate.mockRejectedValueOnce(new Error('Network timeout'))

    const actions = [{ action_type: 'create_issue', payload: { title: 'X', body: '', labels: [] } }]
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })

    let fromCallIdx = 0
    mockServiceFrom.mockImplementation(() => {
      fromCallIdx++
      if (fromCallIdx === 1) return planChain(actions)  // claim
      if (fromCallIdx === 2) return installationChain()
      if (fromCallIdx === 3) return workspaceChain()
      return { update: mockUpdate }
    })

    const { executePlanActions } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).rejects.toThrow('went wrong')
  })

  it('commit_file: creates a new file when it does not exist (no sha)', async () => {
    mockReposGetContent.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))

    const actions = [{
      action_type: 'commit_file',
      payload: { file_path: 'README.md', content: 'Hello world', commit_message: 'Add README', branch: 'bot/add-readme' },
    }]
    mockServiceFrom
      .mockReturnValueOnce(planChain(actions))
      .mockReturnValueOnce(installationChain())
      .mockReturnValueOnce(workspaceChain())
      .mockReturnValueOnce(updateChain())

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    expect(mockReposGetContent).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', path: 'README.md', ref: 'bot/add-readme' })
    expect(mockReposCreateOrUpdateFileContents).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'owner',
      repo: 'repo',
      path: 'README.md',
      message: 'Add README',
      content: Buffer.from('Hello world').toString('base64'),
      branch: 'bot/add-readme',
    }))
    const call = mockReposCreateOrUpdateFileContents.mock.calls[0][0]
    expect(call).not.toHaveProperty('sha')
  })

  it('commit_file: throws FileAlreadyExistsError when file already exists on the branch', async () => {
    mockReposGetContent.mockResolvedValueOnce({
      data: { type: 'file', sha: 'existingsha456' },
    })

    const actions = [{
      action_type: 'commit_file',
      payload: { file_path: 'src/index.ts', content: 'export {}', commit_message: 'Update index', branch: 'bot/update-index' },
    }]
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })
    let fromCallIdx = 0
    mockServiceFrom.mockImplementation(() => {
      fromCallIdx++
      if (fromCallIdx === 1) return planChain(actions)
      if (fromCallIdx === 2) return installationChain()
      if (fromCallIdx === 3) return workspaceChain()
      return { update: mockUpdate }
    })

    const { executePlanActions, FileAlreadyExistsError } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).rejects.toThrow(FileAlreadyExistsError)
    // Plan should be marked failed
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('commit_file: encodes content as base64', async () => {
    mockReposGetContent.mockRejectedValueOnce(new Error('Not Found'))

    const content = '# My Readme\n\nSome text here'
    const actions = [{
      action_type: 'commit_file',
      payload: { file_path: 'README.md', content, commit_message: 'docs', branch: 'bot/docs' },
    }]
    mockServiceFrom
      .mockReturnValueOnce(planChain(actions))
      .mockReturnValueOnce(installationChain())
      .mockReturnValueOnce(workspaceChain())
      .mockReturnValueOnce(updateChain())

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    expect(mockReposCreateOrUpdateFileContents).toHaveBeenCalledWith(expect.objectContaining({
      content: Buffer.from(content).toString('base64'),
    }))
  })

  it('commit_file: uses default values when payload fields are missing', async () => {
    mockReposGetContent.mockRejectedValueOnce(new Error('Not Found'))

    const actions = [{ action_type: 'commit_file', payload: {} }]
    mockServiceFrom
      .mockReturnValueOnce(planChain(actions))
      .mockReturnValueOnce(installationChain())
      .mockReturnValueOnce(workspaceChain())
      .mockReturnValueOnce(updateChain())

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    expect(mockReposCreateOrUpdateFileContents).toHaveBeenCalledWith(expect.objectContaining({
      path: 'README.md',
      branch: 'main',
      message: 'Add README.md',
    }))
  })

  // ── patch_github_file ───────────────────────────────────────────────────────

  it('patch_github_file: happy path — fetches file, replaces old_string once, commits with sha', async () => {
    const original = 'line one\nconst X = 5\nline three'
    mockReposGetContent.mockResolvedValueOnce({
      data: { type: 'file', content: Buffer.from(original).toString('base64'), sha: 'filesha123' },
    })

    const actions = [{
      action_type: 'patch_github_file',
      payload: {
        file_path: 'lib/config.ts',
        old_string: 'const X = 5',
        new_string: 'const X = 10',
        branch: 'bot/bump-x',
        commit_message: 'patch: bump X',
      },
    }]
    mockServiceFrom
      .mockReturnValueOnce(planChain(actions))
      .mockReturnValueOnce(installationChain())
      .mockReturnValueOnce(workspaceChain())
      .mockReturnValueOnce(updateChain())

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    const expected = 'line one\nconst X = 10\nline three'
    expect(mockReposCreateOrUpdateFileContents).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      path: 'lib/config.ts',
      message: 'patch: bump X',
      content: Buffer.from(expected).toString('base64'),
      sha: 'filesha123',
      branch: 'bot/bump-x',
    })
  })

  it('patch_github_file: preserves all surrounding content — only targeted section changes', async () => {
    // Simulate a large file where only one section should change
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}: original content here`)
    lines[49] = 'const TARGET = "old"'
    const original = lines.join('\n')

    mockReposGetContent.mockResolvedValueOnce({
      data: { type: 'file', content: Buffer.from(original).toString('base64'), sha: 'sha-large' },
    })

    const actions = [{
      action_type: 'patch_github_file',
      payload: {
        file_path: 'lib/big.ts',
        old_string: 'const TARGET = "old"',
        new_string: 'const TARGET = "new"',
        branch: 'bot/fix-target',
      },
    }]
    mockServiceFrom
      .mockReturnValueOnce(planChain(actions))
      .mockReturnValueOnce(installationChain())
      .mockReturnValueOnce(workspaceChain())
      .mockReturnValueOnce(updateChain())

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    const submitted = mockReposCreateOrUpdateFileContents.mock.calls[0][0]
    const resultLines = Buffer.from(submitted.content, 'base64').toString('utf8').split('\n')
    expect(resultLines).toHaveLength(100)
    expect(resultLines[49]).toBe('const TARGET = "new"')
    // All other lines unchanged
    expect(resultLines[0]).toBe('line 1: original content here')
    expect(resultLines[99]).toBe('line 100: original content here')
  })

  it('patch_github_file: throws PatchNoMatchError when old_string not found', async () => {
    const original = 'line one\nconst Y = 5\nline three'
    mockReposGetContent.mockResolvedValueOnce({
      data: { type: 'file', content: Buffer.from(original).toString('base64'), sha: 'sha-abc' },
    })

    const actions = [{
      action_type: 'patch_github_file',
      payload: {
        file_path: 'lib/config.ts',
        old_string: 'const NONEXISTENT = 99',
        new_string: 'const NONEXISTENT = 100',
        branch: 'bot/fix',
      },
    }]
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })
    let fromCallIdx = 0
    mockServiceFrom.mockImplementation(() => {
      fromCallIdx++
      if (fromCallIdx === 1) return planChain(actions)
      if (fromCallIdx === 2) return installationChain()
      if (fromCallIdx === 3) return workspaceChain()
      return { update: mockUpdate }
    })

    const { executePlanActions, PatchNoMatchError } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).rejects.toThrow(PatchNoMatchError)
    expect(mockReposCreateOrUpdateFileContents).not.toHaveBeenCalled()
  })

  it('patch_github_file: throws PatchAmbiguousError when old_string matches more than once', async () => {
    const original = 'const X = 1\nconst X = 1\nother line'
    mockReposGetContent.mockResolvedValueOnce({
      data: { type: 'file', content: Buffer.from(original).toString('base64'), sha: 'sha-dup' },
    })

    const actions = [{
      action_type: 'patch_github_file',
      payload: {
        file_path: 'lib/dupe.ts',
        old_string: 'const X = 1',
        new_string: 'const X = 2',
        branch: 'bot/fix-dupe',
      },
    }]
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })
    let fromCallIdx = 0
    mockServiceFrom.mockImplementation(() => {
      fromCallIdx++
      if (fromCallIdx === 1) return planChain(actions)
      if (fromCallIdx === 2) return installationChain()
      if (fromCallIdx === 3) return workspaceChain()
      return { update: mockUpdate }
    })

    const { executePlanActions, PatchAmbiguousError } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).rejects.toThrow(PatchAmbiguousError)
    expect(mockReposCreateOrUpdateFileContents).not.toHaveBeenCalled()
  })

  it('patch_github_file: error message includes file path and count for ambiguous match', async () => {
    const original = 'foo\nfoo\nbar'
    mockReposGetContent.mockResolvedValueOnce({
      data: { type: 'file', content: Buffer.from(original).toString('base64'), sha: 'sha-x' },
    })

    const actions = [{
      action_type: 'patch_github_file',
      payload: { file_path: 'src/util.ts', old_string: 'foo', new_string: 'baz', branch: 'bot/fix' },
    }]
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })
    let fromCallIdx = 0
    mockServiceFrom.mockImplementation(() => {
      fromCallIdx++
      if (fromCallIdx === 1) return planChain(actions)
      if (fromCallIdx === 2) return installationChain()
      if (fromCallIdx === 3) return workspaceChain()
      return { update: mockUpdate }
    })

    const { executePlanActions } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).rejects.toThrow('2 locations')
  })

  it('patch_github_file: error message tells bot to re-read on no-match', async () => {
    const original = 'some content'
    mockReposGetContent.mockResolvedValueOnce({
      data: { type: 'file', content: Buffer.from(original).toString('base64'), sha: 'sha-y' },
    })

    const actions = [{
      action_type: 'patch_github_file',
      payload: { file_path: 'src/x.ts', old_string: 'missing text', new_string: 'replacement', branch: 'bot/fix' },
    }]
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })
    let fromCallIdx = 0
    mockServiceFrom.mockImplementation(() => {
      fromCallIdx++
      if (fromCallIdx === 1) return planChain(actions)
      if (fromCallIdx === 2) return installationChain()
      if (fromCallIdx === 3) return workspaceChain()
      return { update: mockUpdate }
    })

    const { executePlanActions } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).rejects.toThrow('Read the file again')
  })
})
