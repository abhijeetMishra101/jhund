/**
 * Security test: F-001 — executor double-execution guard
 *
 * executePlanActions must atomically claim the plan by setting status='executing'
 * before doing any GitHub work. If the plan is already claimed, it must return
 * early without executing actions or consuming the action budget.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServiceFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({
    from: mockServiceFrom,
    rpc: mockRpc,
  }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))
vi.mock('@/lib/github/auth', () => ({
  getInstallationOctokit: vi.fn(),
}))

const PLAN_ID = 'plan-uuid'
const WORKSPACE_ID = 'ws-uuid'

function claimChain(claimed: boolean) {
  const data = claimed
    ? { github_actions: [], channel_id: 'ch-uuid' }
    : null
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data, error: null }),
    }),
  }
}

describe('executePlanActions — double-execution guard (F-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockServiceFrom.mockReset()
    mockRpc.mockReset()
  })

  it('returns early without calling GitHub when plan is already executing', async () => {
    // Simulate: claim fails (plan already in executing state)
    mockServiceFrom.mockReturnValueOnce(claimChain(false))

    const { executePlanActions } = await import('@/lib/github/executor')
    const { getInstallationOctokit } = await import('@/lib/github/auth')

    await executePlanActions(PLAN_ID, WORKSPACE_ID)

    // GitHub was never called
    expect(getInstallationOctokit).not.toHaveBeenCalled()
    // Action cap RPC was never called
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('proceeds with execution when plan claim succeeds', async () => {
    // Claim succeeds
    mockServiceFrom
      .mockReturnValueOnce(claimChain(true))
      // github_installations
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { installation_id: '123', repo_full_name: 'owner/repo' },
        }),
      })

    mockRpc.mockResolvedValue({ data: true }) // action cap allows

    const { getInstallationOctokit } = await import('@/lib/github/auth')
    const mockOctokit = {
      rest: {
        repos: { get: vi.fn().mockResolvedValue({ data: { default_branch: 'main' } }) },
        issues: { createComment: vi.fn().mockResolvedValue({}) },
      },
    }
    vi.mocked(getInstallationOctokit).mockResolvedValue(mockOctokit as never)

    // plans update (executed) + messages
    mockServiceFrom
      .mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { actions_used: 1, action_cap: 50 } }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) }),
        insert: vi.fn().mockResolvedValue({}),
      })

    const { executePlanActions } = await import('@/lib/github/executor')
    // Should not throw when actions array is empty
    await expect(executePlanActions(PLAN_ID, WORKSPACE_ID)).resolves.toBeUndefined()
    expect(getInstallationOctokit).toHaveBeenCalledWith(123)
  })
})
