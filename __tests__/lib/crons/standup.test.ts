import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRespondToMessage = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockServiceFrom = vi.hoisted(() => vi.fn())
const mockAnthropicCreate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/bots', () => ({ respondToMessage: mockRespondToMessage }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockAnthropicCreate }
  },
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
      error: null,
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

function latestBotMessageChain(content: string | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: content ? { content } : null, error: null }),
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
    mockRespondToMessage.mockResolvedValue(undefined)
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Good morning! Here is what the team is up to.' }],
    })
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

  it('posts opening message, triggers bots, then posts Riley digest', async () => {
    const botChannel = { id: BOT_CH, name: 'engineering', display_name: '# engineering', bot_role_id: BOT_ROLE_ID }

    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(standupChannelChain(true))   // standup channel
      .mockReturnValueOnce(rileyChain(true))             // riley lookup
      .mockReturnValueOnce(insertChain())                // opening message insert
      .mockReturnValueOnce(activeChannelsChain([botChannel])) // active channels
      .mockReturnValueOnce(insertChain())                // standup prompt insert in bot ch
      .mockReturnValueOnce(latestBotMessageChain('Working on the auth PR today.')) // read back bot response
      .mockReturnValueOnce(insertChain())                // digest insert in #standup
      .mockReturnValueOnce(updateChain())                // last_standup_at update

    const { runStandup } = await import('@/lib/crons/standup')
    const result = await runStandup()
    expect(result.workspaces).toBe(1)
    expect(mockRespondToMessage).toHaveBeenCalledWith(BOT_CH, WS_ID)
    expect(mockAnthropicCreate).toHaveBeenCalledOnce()
  })

  it('posts quiet-morning message when no bot channels exist', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })

    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(standupChannelChain(true))
      .mockReturnValueOnce(rileyChain(true))
      .mockReturnValueOnce({ insert: insertMock })       // opening message
      .mockReturnValueOnce(activeChannelsChain([]))      // no bot channels

    const { runStandup } = await import('@/lib/crons/standup')
    await runStandup()
    expect(mockRespondToMessage).not.toHaveBeenCalled()
  })

  it('skips ops channel from bot trigger list', async () => {
    const opsBotChannel = { id: 'ch-ops', name: 'ops', display_name: '# ops', bot_role_id: OPS_BOT_ID }

    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(standupChannelChain(true))
      .mockReturnValueOnce(rileyChain(true))
      .mockReturnValueOnce(insertChain())
      .mockReturnValueOnce(activeChannelsChain([opsBotChannel]))

    const { runStandup } = await import('@/lib/crons/standup')
    await runStandup()
    expect(mockRespondToMessage).not.toHaveBeenCalled()
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

  it('handles respondToMessage errors and continues', async () => {
    mockRespondToMessage.mockRejectedValueOnce(new Error('Claude timeout'))
    const botChannel = { id: BOT_CH, name: 'engineering', display_name: '# engineering', bot_role_id: BOT_ROLE_ID }

    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(standupChannelChain(true))
      .mockReturnValueOnce(rileyChain(true))
      .mockReturnValueOnce(insertChain())
      .mockReturnValueOnce(activeChannelsChain([botChannel]))
      .mockReturnValueOnce(insertChain())
      .mockReturnValueOnce(latestBotMessageChain(null))  // no response captured
      .mockReturnValueOnce(insertChain())                // digest still posts
      .mockReturnValueOnce(updateChain())

    const { runStandup } = await import('@/lib/crons/standup')
    const result = await runStandup()
    expect(result.workspaces).toBe(1)
  })

  it('returns correct workspaces count', async () => {
    mockServiceFrom
      .mockReturnValueOnce(workspacesChain(['ws-1', 'ws-2']))
      .mockReturnValueOnce(standupChannelChain(false))
      .mockReturnValueOnce(standupChannelChain(false))
    const { runStandup } = await import('@/lib/crons/standup')
    const result = await runStandup()
    expect(result.workspaces).toBe(2)
  })
})
