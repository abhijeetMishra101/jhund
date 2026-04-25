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

function listChain(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    mockResolvedValue: vi.fn(),
    then: undefined as unknown,
  }
}

describe('routeGithubEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
  })

  it('returns [] when no installation found', async () => {
    mockServiceFrom.mockReturnValueOnce(singleChain(null)) // github_installations
    const { routeGithubEvent } = await import('@/lib/github/router')
    expect(await routeGithubEvent(INSTALLATION_ID, 'pull_request', [])).toEqual([])
  })

  it('returns [] when no matching triggers', async () => {
    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID })) // installations
      .mockReturnValueOnce({ // github_triggers (first query)
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: undefined,
      })

    // Mock the triggers query to return empty
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    // Make the eq chain eventually resolve to empty
    let eqCallCount = 0
    chain.eq.mockImplementation(() => {
      eqCallCount++
      if (eqCallCount >= 2) return Promise.resolve({ data: [], error: null })
      return chain
    })
    mockServiceFrom.mockReturnValueOnce(chain)

    const { routeGithubEvent } = await import('@/lib/github/router')
    expect(await routeGithubEvent(INSTALLATION_ID, 'pull_request', [])).toEqual([])
  })

  it('returns all triggers when there is no label_filter', async () => {
    const triggers = [{ channel_id: CHANNEL_ID, label_filter: null }]

    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce({ // first triggers query (existence check)
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function(this: unknown) {
          return { eq: vi.fn().mockResolvedValue({ data: triggers, error: null }) }
        }),
      })
      .mockReturnValueOnce({ // second triggers query (with label_filter)
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function(this: unknown) {
          return { eq: vi.fn().mockResolvedValue({ data: triggers, error: null }) }
        }),
      })

    const { routeGithubEvent } = await import('@/lib/github/router')
    const result = await routeGithubEvent(INSTALLATION_ID, 'pull_request', [])
    expect(result).toEqual([{ channelId: CHANNEL_ID, workspaceId: WORKSPACE_ID }])
  })

  it('filters out triggers where label_filter does not match', async () => {
    const triggers = [
      { channel_id: 'ch-1', label_filter: 'security' },
      { channel_id: 'ch-2', label_filter: null },
    ]

    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function(this: unknown) {
          return { eq: vi.fn().mockResolvedValue({ data: triggers, error: null }) }
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function(this: unknown) {
          return { eq: vi.fn().mockResolvedValue({ data: triggers, error: null }) }
        }),
      })

    const { routeGithubEvent } = await import('@/lib/github/router')
    // No 'security' label in payload → only the no-filter trigger matches
    const result = await routeGithubEvent(INSTALLATION_ID, 'pull_request', ['bug'])
    expect(result).toHaveLength(1)
    expect(result[0].channelId).toBe('ch-2')
  })

  it('returns [] when allTriggers query returns null (uses ?? [] fallback)', async () => {
    const triggers = [{ channel_id: CHANNEL_ID, label_filter: null }]

    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce({ // first triggers query (existence check)
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function(this: unknown) {
          return { eq: vi.fn().mockResolvedValue({ data: triggers, error: null }) }
        }),
      })
      .mockReturnValueOnce({ // second triggers query returns null data
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function(this: unknown) {
          return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
        }),
      })

    const { routeGithubEvent } = await import('@/lib/github/router')
    const result = await routeGithubEvent(INSTALLATION_ID, 'pull_request', [])
    expect(result).toEqual([])
  })

  it('includes trigger when label_filter matches a payload label', async () => {
    const triggers = [{ channel_id: CHANNEL_ID, label_filter: 'security' }]

    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function(this: unknown) {
          return { eq: vi.fn().mockResolvedValue({ data: triggers, error: null }) }
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function(this: unknown) {
          return { eq: vi.fn().mockResolvedValue({ data: triggers, error: null }) }
        }),
      })

    const { routeGithubEvent } = await import('@/lib/github/router')
    const result = await routeGithubEvent(INSTALLATION_ID, 'pull_request', ['bug', 'security'])
    expect(result).toHaveLength(1)
    expect(result[0].channelId).toBe(CHANNEL_ID)
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
