import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServiceFrom = vi.hoisted(() => vi.fn())
const mockAnthropicCreate = vi.hoisted(() => vi.fn())

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
const RETRO_CH = 'ch-retro'
const RILEY_ID = 'bot-ops'

function workspacesChain(ids: string[]) {
  return { select: vi.fn().mockResolvedValue({ data: ids.map((id) => ({ id })), error: null }) }
}

function retroChannelChain(found: boolean) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: found ? { id: RETRO_CH } : null,
      error: found ? null : { message: 'not found' },
    }),
  }
}

function rileyChain(found: boolean) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: found ? { id: RILEY_ID } : null,
      error: null,
    }),
  }
}

function messagesChain(messages: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: messages, error: null }),
  }
}

function insertChain() {
  return { insert: vi.fn().mockResolvedValue({ error: null }) }
}

function updateChain() {
  return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
}

describe('runRetrospective', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockServiceFrom.mockReset()
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Great week everyone!' }],
    })
  })

  it('returns { workspaces: 0 } when no workspaces exist', async () => {
    mockServiceFrom.mockReturnValueOnce(workspacesChain([]))
    const { runRetrospective } = await import('@/lib/crons/retrospective')
    const result = await runRetrospective()
    expect(result).toEqual({ workspaces: 0 })
  })

  it('skips workspace when no #retrospective channel found', async () => {
    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(retroChannelChain(false))

    const { runRetrospective } = await import('@/lib/crons/retrospective')
    const result = await runRetrospective()
    expect(result.workspaces).toBe(1)
    expect(mockAnthropicCreate).not.toHaveBeenCalled()
  })

  it('posts quiet-week message when no messages found', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(retroChannelChain(true))
      .mockReturnValueOnce(rileyChain(true))
      .mockReturnValueOnce(messagesChain([]))
      .mockReturnValueOnce({ insert: insertMock })
      .mockReturnValueOnce(updateChain())

    const { runRetrospective } = await import('@/lib/crons/retrospective')
    await runRetrospective()
    expect(mockAnthropicCreate).not.toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('quiet week') })
    )
  })

  it('calls Claude and posts summary when messages exist', async () => {
    const msg = { content: 'deployed the auth fix', author_type: 'bot', created_at: new Date().toISOString() }
    const insertMock = vi.fn().mockResolvedValue({ error: null })

    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(retroChannelChain(true))
      .mockReturnValueOnce(rileyChain(true))
      .mockReturnValueOnce(messagesChain([msg]))
      .mockReturnValueOnce({ insert: insertMock })
      .mockReturnValueOnce(updateChain())

    const { runRetrospective } = await import('@/lib/crons/retrospective')
    await runRetrospective()
    expect(mockAnthropicCreate).toHaveBeenCalledOnce()
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Great week everyone!' })
    )
  })

  it('returns correct workspaces count', async () => {
    mockServiceFrom
      .mockReturnValueOnce(workspacesChain(['ws-1', 'ws-2']))
      .mockReturnValueOnce(retroChannelChain(false))
      .mockReturnValueOnce(retroChannelChain(false))

    const { runRetrospective } = await import('@/lib/crons/retrospective')
    const result = await runRetrospective()
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

    const { runRetrospective } = await import('@/lib/crons/retrospective')
    const result = await runRetrospective()
    expect(result.workspaces).toBe(1)
  })
})
