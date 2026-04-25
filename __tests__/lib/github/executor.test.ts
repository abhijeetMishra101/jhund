import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Octokit mock ─────────────────────────────────────────────────────────────
const mockIssuesCreate = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockIssuesCreateComment = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockPullsCreate = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockGitGetRef = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { object: { sha: 'abc123' } } }))
const mockGitCreateRef = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockGetInstallationOctokit = vi.hoisted(() => vi.fn())

vi.mock('@octokit/app', () => ({
  App: class MockApp {
    getInstallationOctokit = mockGetInstallationOctokit
  },
}))

const mockOctokit = {
  rest: {
    issues: { create: mockIssuesCreate, createComment: mockIssuesCreateComment },
    pulls: { create: mockPullsCreate },
    git: { getRef: mockGitGetRef, createRef: mockGitCreateRef },
  },
}

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))

const PLAN_ID = 'plan-uuid'
const WORKSPACE_ID = 'workspace-uuid'
const INSTALLATION_ID = '12345'
const REPO = 'owner/repo'

function planChain(actions: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { github_actions: actions }, error: null }),
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

beforeEach(() => {
  vi.clearAllMocks()
  mockServiceFrom.mockReset()
  process.env.GITHUB_APP_ID = 'app-id'
  process.env.GITHUB_APP_PRIVATE_KEY = 'private-key'
  mockGetInstallationOctokit.mockResolvedValue(mockOctokit)
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
      return { update: mockUpdate, select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const { executePlanActions } = await import('@/lib/github/executor')
    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'executed' }))
  })
})
