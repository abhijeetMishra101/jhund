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

const WS_ID = 'ws-1'
const STANDUP_CH = 'ch-standup'
const BOT_CH = 'ch-backend'
const BOT_ROLE_ID = 'bot-backend'
const OPS_BOT_ID = 'bot-ops'

function workspacesChain(ids: string[]) {
  return { select: vi.fn().mockResolvedValue({ data: ids.map((id) => ({ id })), error: null }) }
}

function standupChannelChain(found: boolean) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: found ? { id: STANDUP_CH } : null,
      error: found ? null : { message: 'not found' },
    }),
  }
}

function rileyChain(found: boolean) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: found ? { id: OPS_BOT_ID } : null,
      error: found ? null : { message: 'not found' },
    }),
  }
}

function insertChain() {
  return { insert: vi.fn().mockResolvedValue({ error: null }) }
}

function activeChannelsChain(channels: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    not: vi.fn().mockResolvedValue({ data: channels, error: null }),
  }
}

function updateChain() {
  return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
}

describe('runStandup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockServiceFrom.mockReset()
  })

  it('returns { workspaces: 0 } when no workspaces exist', async () => {
    mockServiceFrom.mockReturnValueOnce(workspacesChain([]))
    const { runStandup } = await import('@/lib/crons/standup')
    const result = await runStandup()
    expect(result).toEqual({ workspaces: 0 })
  })

  it('skips workspace when no #standup channel found', async () => {
    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(standupChannelChain(false))

    const { runStandup } = await import('@/lib/crons/standup')
    const result = await runStandup()
    expect(result.workspaces).toBe(1)
    expect(mockRespondToMessage).not.toHaveBeenCalled()
  })

  it('posts opening message and triggers bot channels', async () => {
    const botChannel = { id: BOT_CH, bot_role_id: BOT_ROLE_ID }

    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(standupChannelChain(true))
      .mockReturnValueOnce(rileyChain(true))
      .mockReturnValueOnce(insertChain())
      .mockReturnValueOnce(activeChannelsChain([botChannel]))
      .mockReturnValueOnce(rileyChain(true))
      .mockReturnValueOnce(insertChain())
      .mockReturnValueOnce(updateChain())

    const { runStandup } = await import('@/lib/crons/standup')
    const result = await runStandup()
    expect(result.workspaces).toBe(1)
    expect(mockRespondToMessage).toHaveBeenCalledWith(BOT_CH, WS_ID)
  })

  it('skips ops channel from bot trigger list', async () => {
    const opsBotChannel = { id: 'ch-ops', bot_role_id: OPS_BOT_ID }

    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(standupChannelChain(true))
      .mockReturnValueOnce(rileyChain(true))
      .mockReturnValueOnce(insertChain())
      .mockReturnValueOnce(activeChannelsChain([opsBotChannel]))
      .mockReturnValueOnce(rileyChain(true))
      .mockReturnValueOnce(updateChain())

    const { runStandup } = await import('@/lib/crons/standup')
    await runStandup()
    expect(mockRespondToMessage).not.toHaveBeenCalled()
  })

  it('continues to next workspace when one workspace errors', async () => {
    mockServiceFrom
      .mockReturnValueOnce(workspacesChain(['ws-1', 'ws-2']))
      .mockReturnValueOnce(standupChannelChain(false))
      .mockReturnValueOnce(standupChannelChain(false))

    const { runStandup } = await import('@/lib/crons/standup')
    const result = await runStandup()
    expect(result.workspaces).toBe(2)
  })

  it('handles workspace-level errors gracefully via catch', async () => {
    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error('DB down')),
      })

    const { runStandup } = await import('@/lib/crons/standup')
    const result = await runStandup()
    expect(result.workspaces).toBe(1)
  })

  it('handles respondToMessage errors gracefully via catch', async () => {
    mockRespondToMessage.mockRejectedValueOnce(new Error('Claude timeout'))
    const botChannel = { id: BOT_CH, bot_role_id: BOT_ROLE_ID }

    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(standupChannelChain(true))
      .mockReturnValueOnce(rileyChain(true))
      .mockReturnValueOnce(insertChain())
      .mockReturnValueOnce(activeChannelsChain([botChannel]))
      .mockReturnValueOnce(rileyChain(true))
      .mockReturnValueOnce(insertChain())
      .mockReturnValueOnce(updateChain())

    const { runStandup } = await import('@/lib/crons/standup')
    const result = await runStandup()
    expect(result.workspaces).toBe(1)
  })
})
