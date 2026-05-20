import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRespondToMessage = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/bots', () => ({ respondToMessage: mockRespondToMessage }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

function step(overrides: Partial<import('@/lib/workflow-chain').ChainStep> = {}): import('@/lib/workflow-chain').ChainStep {
  return {
    channelId: 'ch-1',
    workspaceId: 'ws-1',
    chainGroup: null,
    chainType: 'parallel',
    chainOrder: 0,
    ...overrides,
  }
}

function channelChain(displayName: string) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { display_name: displayName }, error: null }),
  }
}

function insertChain() {
  return { insert: vi.fn().mockResolvedValue({ error: null }) }
}

describe('buildChains', () => {
  it('returns standalone steps (chain_group=null) as single-step chains', async () => {
    const { buildChains } = await import('@/lib/workflow-chain')
    const steps = [
      step({ channelId: 'ch-1', chainGroup: null }),
      step({ channelId: 'ch-2', chainGroup: null }),
    ]
    const chains = buildChains(steps)
    expect(chains).toHaveLength(2)
    expect(chains[0]).toHaveLength(1)
    expect(chains[1]).toHaveLength(1)
  })

  it('groups steps by chain_group', async () => {
    const { buildChains } = await import('@/lib/workflow-chain')
    const steps = [
      step({ channelId: 'ch-1', chainGroup: 'pr-review', chainOrder: 0 }),
      step({ channelId: 'ch-2', chainGroup: 'pr-review', chainOrder: 1 }),
    ]
    const chains = buildChains(steps)
    expect(chains).toHaveLength(1)
    expect(chains[0]).toHaveLength(2)
  })

  it('sorts sequential steps by chain_order ascending', async () => {
    const { buildChains } = await import('@/lib/workflow-chain')
    const steps = [
      step({ channelId: 'ch-qa',  chainGroup: 'pr-review', chainOrder: 1 }),
      step({ channelId: 'ch-eng', chainGroup: 'pr-review', chainOrder: 0 }),
    ]
    const chains = buildChains(steps)
    expect(chains[0][0].channelId).toBe('ch-eng')
    expect(chains[0][1].channelId).toBe('ch-qa')
  })

  it('keeps different chain_groups as separate chains', async () => {
    const { buildChains } = await import('@/lib/workflow-chain')
    const steps = [
      step({ channelId: 'ch-1', chainGroup: 'pr-review', chainOrder: 0 }),
      step({ channelId: 'ch-2', chainGroup: 'security-alert', chainOrder: 0 }),
    ]
    const chains = buildChains(steps)
    expect(chains).toHaveLength(2)
  })

  it('handles mix of standalone and grouped steps', async () => {
    const { buildChains } = await import('@/lib/workflow-chain')
    const steps = [
      step({ channelId: 'ch-standalone', chainGroup: null }),
      step({ channelId: 'ch-a', chainGroup: 'pr-review', chainOrder: 0 }),
      step({ channelId: 'ch-b', chainGroup: 'pr-review', chainOrder: 1 }),
    ]
    const chains = buildChains(steps)
    expect(chains).toHaveLength(2)
  })
})

describe('executeChain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockServiceFrom.mockReset()
    mockRespondToMessage.mockResolvedValue(undefined)
  })

  it('calls respondToMessage for a single standalone step', async () => {
    const { executeChain } = await import('@/lib/workflow-chain')
    await executeChain([step({ channelId: 'ch-1' })])
    expect(mockRespondToMessage).toHaveBeenCalledWith('ch-1', 'ws-1')
  })

  it('calls all parallel steps concurrently (both called)', async () => {
    const { executeChain } = await import('@/lib/workflow-chain')
    const steps = [
      step({ channelId: 'ch-1', chainType: 'parallel', chainGroup: 'g', chainOrder: 0 }),
      step({ channelId: 'ch-2', chainType: 'parallel', chainGroup: 'g', chainOrder: 1 }),
    ]
    await executeChain(steps)
    expect(mockRespondToMessage).toHaveBeenCalledTimes(2)
    expect(mockRespondToMessage).toHaveBeenCalledWith('ch-1', 'ws-1')
    expect(mockRespondToMessage).toHaveBeenCalledWith('ch-2', 'ws-1')
  })

  it('runs sequential steps in chain_order (ch-eng before ch-qa)', async () => {
    const callOrder: string[] = []
    mockRespondToMessage.mockImplementation(async (channelId: string) => {
      callOrder.push(channelId)
    })
    mockServiceFrom
      .mockReturnValueOnce(channelChain('# engineering'))
      .mockReturnValueOnce(channelChain('# qa'))
      .mockReturnValueOnce(insertChain())

    const { executeChain } = await import('@/lib/workflow-chain')
    const steps = [
      step({ channelId: 'ch-eng', chainType: 'sequential', chainGroup: 'pr-review', chainOrder: 0 }),
      step({ channelId: 'ch-qa',  chainType: 'sequential', chainGroup: 'pr-review', chainOrder: 1 }),
    ]
    await executeChain(steps)
    expect(callOrder).toEqual(['ch-eng', 'ch-qa'])
  })

  it('posts a handoff announcement before the second sequential step', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    mockServiceFrom
      .mockReturnValueOnce(channelChain('# engineering'))
      .mockReturnValueOnce(channelChain('# qa'))
      .mockReturnValueOnce({ insert: insertMock })

    const { executeChain } = await import('@/lib/workflow-chain')
    const steps = [
      step({ channelId: 'ch-eng', chainType: 'sequential', chainGroup: 'pr-review', chainOrder: 0 }),
      step({ channelId: 'ch-qa',  chainType: 'sequential', chainGroup: 'pr-review', chainOrder: 1 }),
    ]
    await executeChain(steps)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('# engineering') })
    )
  })

  it('does NOT post announcement for a single-step chain', async () => {
    const { executeChain } = await import('@/lib/workflow-chain')
    await executeChain([step({ channelId: 'ch-1', chainType: 'sequential' })])
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('continues remaining steps if one step throws', async () => {
    mockRespondToMessage
      .mockRejectedValueOnce(new Error('Claude timeout'))
      .mockResolvedValueOnce(undefined)

    mockServiceFrom
      .mockReturnValueOnce(channelChain('# engineering'))
      .mockReturnValueOnce(channelChain('# qa'))
      .mockReturnValueOnce(insertChain())

    const { executeChain } = await import('@/lib/workflow-chain')
    const steps = [
      step({ channelId: 'ch-eng', chainType: 'sequential', chainGroup: 'pr-review', chainOrder: 0 }),
      step({ channelId: 'ch-qa',  chainType: 'sequential', chainGroup: 'pr-review', chainOrder: 1 }),
    ]
    await expect(executeChain(steps)).resolves.toBeUndefined()
    expect(mockRespondToMessage).toHaveBeenCalledTimes(2)
  })

  it('returns immediately for an empty step list', async () => {
    const { executeChain } = await import('@/lib/workflow-chain')
    await expect(executeChain([])).resolves.toBeUndefined()
    expect(mockRespondToMessage).not.toHaveBeenCalled()
  })

  it('parallel step — swallows error and still completes (error in .catch)', async () => {
    // First step throws, second succeeds — chain should resolve without throwing
    mockRespondToMessage
      .mockRejectedValueOnce(new Error('Claude timeout'))
      .mockResolvedValueOnce(undefined)

    const { executeChain } = await import('@/lib/workflow-chain')
    const steps = [
      step({ channelId: 'ch-1', chainType: 'parallel', chainGroup: 'g', chainOrder: 0 }),
      step({ channelId: 'ch-2', chainType: 'parallel', chainGroup: 'g', chainOrder: 1 }),
    ]

    // Must NOT throw — parallel errors are swallowed via .catch()
    await expect(executeChain(steps)).resolves.toBeUndefined()
    expect(mockRespondToMessage).toHaveBeenCalledTimes(2)
  })
})
