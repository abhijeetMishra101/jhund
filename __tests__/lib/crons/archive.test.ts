import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServiceFrom = vi.hoisted(() => vi.fn())
const mockStorage = vi.hoisted(() => ({
  from: vi.fn().mockReturnValue({
    upload: vi.fn().mockResolvedValue({ error: null }),
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({
    from: mockServiceFrom,
    storage: mockStorage,
  }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))

const WS_ID = 'ws-1'
const CH_ID = 'ch-1'

const OLD_DATE = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
const NEW_DATE = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

function workspacesChain(ids: string[]) {
  return {
    select: vi.fn().mockResolvedValue({ data: ids.map((id) => ({ id })), error: null }),
  }
}

function channelsChain(ids: string[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: ids.map((id) => ({ id })), error: null }),
  }
}

function messagesChain(messages: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: messages, error: null }),
  }
}

function deleteChain(error: unknown = null) {
  return {
    delete: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ error }),
    }),
  }
}

describe('archiveOldMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockServiceFrom.mockReset()
    mockStorage.from.mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }) })
  })

  it('returns { archived: 0, workspaces: 0 } when no workspaces exist', async () => {
    mockServiceFrom.mockReturnValueOnce({ select: vi.fn().mockResolvedValue({ data: [], error: null }) })
    const { archiveOldMessages } = await import('@/lib/crons/archive')
    const result = await archiveOldMessages()
    expect(result).toEqual({ archived: 0, workspaces: 0 })
  })

  it('archives old messages and deletes them from DB', async () => {
    const oldMsg = { id: 'msg-1', content: 'old', author_type: 'bot', author_id: 'bot-1', created_at: OLD_DATE, plan_id: null }

    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(channelsChain([CH_ID]))
      .mockReturnValueOnce(messagesChain([oldMsg]))
      .mockReturnValueOnce(deleteChain())

    const { archiveOldMessages } = await import('@/lib/crons/archive')
    const result = await archiveOldMessages()
    expect(result.archived).toBe(1)
    expect(mockStorage.from).toHaveBeenCalledWith('message-archives')
  })

  it('does NOT delete messages when storage upload fails', async () => {
    const oldMsg = { id: 'msg-1', content: 'old', author_type: 'bot', author_id: 'bot-1', created_at: OLD_DATE, plan_id: null }
    mockStorage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: { message: 'Storage error' } }),
    })

    const deleteMock = vi.fn()
    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(channelsChain([CH_ID]))
      .mockReturnValueOnce(messagesChain([oldMsg]))
      .mockReturnValueOnce({ delete: deleteMock })

    const { archiveOldMessages } = await import('@/lib/crons/archive')
    const result = await archiveOldMessages()
    expect(result.archived).toBe(0)
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('skips messages that have a plan_id (pending plan context)', async () => {
    const msgWithPlan = { id: 'msg-2', content: 'plan msg', author_type: 'bot', author_id: 'bot-1', created_at: OLD_DATE, plan_id: 'plan-uuid' }

    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(channelsChain([CH_ID]))
      .mockReturnValueOnce(messagesChain([msgWithPlan]))

    const { archiveOldMessages } = await import('@/lib/crons/archive')
    const result = await archiveOldMessages()
    expect(result.archived).toBe(0)
    expect(mockStorage.from).not.toHaveBeenCalled()
  })

  it('returns correct workspaces count', async () => {
    mockServiceFrom
      .mockReturnValueOnce(workspacesChain(['ws-1', 'ws-2']))
      .mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) })

    const { archiveOldMessages } = await import('@/lib/crons/archive')
    const result = await archiveOldMessages()
    expect(result.workspaces).toBe(2)
  })
})
