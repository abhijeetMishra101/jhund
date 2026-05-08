import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Octokit mock ─────────────────────────────────────────────────────────────
const mockIssuesCreate = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockIssuesCreateComment = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockPullsCreate = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockGitGetRef = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { object: { sha: 'abc123' } } }))
const mockGitCreateRef = vi.hoisted(() => vi.fn().mockResolvedValue({}))

const mockOctokit = {
  rest: {
    issues: { create: mockIssuesCreate, createComment: mockIssuesCreateComment },
    pulls: { create: mockPullsCreate },
    git: { getRef: mockGitGetRef, createRef: mockGitCreateRef },
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

function planChain(actions: unknown[], channelId = 'ch-test') {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { github_actions: actions, channel_id: channelId }, error: null }),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
  }
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
  it('throws when plan is not found', async () => {
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    })
    const { executePlanActions } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).rejects.toThrow('Plan not found')
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
      if (fromCallIdx === 1) return { ...planChain(actions), update: mockUpdate }
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
      if (fromCallIdx === 1) return { ...planChain(actions, 'ch-test'), update: mockUpdate }
      if (fromCallIdx === 2) return installationChain()
      if (fromCallIdx === 3) return workspaceChain()
      return { update: mockUpdate }
    })

    const { executePlanActions } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).rejects.toThrow('permissions')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', error_message: expect.stringContaining('permissions') }))
  })

  it('sets plan to failed with 404 message and rethrows when GitHub returns 404', async () => {
    const githubError = Object.assign(new Error('Not Found'), { status: 404 })
    mockGitGetRef.mockRejectedValueOnce(githubError)

    const actions = [{ action_type: 'create_pr', payload: { title: 'PR', body: '', head_branch: 'feat/x', base_branch: 'main' } }]
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })

    let fromCallIdx = 0
    mockServiceFrom.mockImplementation(() => {
      fromCallIdx++
      if (fromCallIdx === 1) return { ...planChain(actions), update: mockUpdate }
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
      if (fromCallIdx === 1) return { ...planChain(actions), update: mockUpdate }
      if (fromCallIdx === 2) return installationChain()
      if (fromCallIdx === 3) return workspaceChain()
      return { update: mockUpdate }
    })

    const { executePlanActions } = await import('@/lib/github/executor')
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).rejects.toThrow('went wrong')
  })
})
