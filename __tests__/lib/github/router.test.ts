import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))

const INSTALLATION_ID = 'inst-123'
const WORKSPACE_ID = 'workspace-uuid'
const CHANNEL_ID = 'channel-uuid'

function singleChain(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  }
}

function triggerRow(overrides: Record<string, unknown> = {}) {
  return {
    channel_id: CHANNEL_ID,
    label_filter: null,
    chain_group: null,
    chain_type: 'parallel',
    chain_order: 0,
    ...overrides,
  }
}

function triggersChain(data: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation(function(this: unknown) {
      return { eq: vi.fn().mockResolvedValue({ data, error: null }) }
    }),
  }
}

describe('routeGithubEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
  })

  it('returns [] when no installation found', async () => {
    mockServiceFrom.mockReturnValueOnce(singleChain(null))
    const { routeGithubEvent } = await import('@/lib/github/router')
    expect(await routeGithubEvent(INSTALLATION_ID, 'pull_request', [])).toEqual([])
  })

  it('returns [] when no matching triggers', async () => {
    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(triggersChain([]))
    const { routeGithubEvent } = await import('@/lib/github/router')
    expect(await routeGithubEvent(INSTALLATION_ID, 'pull_request', [])).toEqual([])
  })

  it('returns ChainStep when trigger has no label_filter', async () => {
    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(triggersChain([triggerRow()]))
    const { routeGithubEvent } = await import('@/lib/github/router')
    const result = await routeGithubEvent(INSTALLATION_ID, 'pull_request', [])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      channelId: CHANNEL_ID,
      workspaceId: WORKSPACE_ID,
      chainGroup: null,
      chainType: 'parallel',
      chainOrder: 0,
    })
  })

  it('filters out triggers where label_filter does not match payload labels', async () => {
    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(triggersChain([
        triggerRow({ channel_id: 'ch-1', label_filter: 'security' }),
        triggerRow({ channel_id: 'ch-2', label_filter: null }),
      ]))
    const { routeGithubEvent } = await import('@/lib/github/router')
    const result = await routeGithubEvent(INSTALLATION_ID, 'pull_request', ['bug'])
    expect(result).toHaveLength(1)
    expect(result[0].channelId).toBe('ch-2')
  })

  it('returns [] when triggers query returns null', async () => {
    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(triggersChain([]))
    const { routeGithubEvent } = await import('@/lib/github/router')
    const result = await routeGithubEvent(INSTALLATION_ID, 'pull_request', [])
    expect(result).toEqual([])
  })

  it('includes trigger when label_filter matches a payload label', async () => {
    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(triggersChain([
        triggerRow({ label_filter: 'security', chain_group: 'security-alert', chain_type: 'parallel', chain_order: 0 }),
      ]))
    const { routeGithubEvent } = await import('@/lib/github/router')
    const result = await routeGithubEvent(INSTALLATION_ID, 'pull_request', ['bug', 'security'])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ channelId: CHANNEL_ID, chainGroup: 'security-alert' })
  })
})

describe('recordInstallation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
  })

  it('upserts a github_installations row', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null })
    mockServiceFrom.mockReturnValueOnce({ upsert: mockUpsert })
    const { recordInstallation } = await import('@/lib/github/router')
    await recordInstallation('inst-1', WORKSPACE_ID, 'owner/repo')
    expect(mockUpsert).toHaveBeenCalledWith(
      { workspace_id: WORKSPACE_ID, installation_id: 'inst-1', repo_full_name: 'owner/repo' },
      { onConflict: 'installation_id' }
    )
  })
})
