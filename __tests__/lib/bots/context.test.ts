import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))

const WORKSPACE_ID = 'workspace-uuid'
const TRIGGER_UUID = '00000000-0000-0000-0000-000000000000'

function makeChain(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error }),
  }
}

describe('buildMessageHistory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array when there are no messages', async () => {
    mockServiceFrom.mockReturnValueOnce(makeChain([]))
    const { buildMessageHistory } = await import('@/lib/bots/context')
    expect(await buildMessageHistory('channel-1')).toEqual([])
  })

  it('maps user messages to role:user', async () => {
    mockServiceFrom.mockReturnValueOnce(makeChain([
      { author_type: 'user', content: 'hello' },
    ]))
    const { buildMessageHistory } = await import('@/lib/bots/context')
    const result = await buildMessageHistory('channel-1')
    expect(result).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('maps bot messages to role:assistant', async () => {
    // DB returns newest-first; function reverses to oldest-first
    mockServiceFrom.mockReturnValueOnce(makeChain([
      { author_type: 'bot', content: 'hello back' }, // newest
      { author_type: 'user', content: 'hi' },          // oldest
    ]))
    const { buildMessageHistory } = await import('@/lib/bots/context')
    const result = await buildMessageHistory('channel-1')
    expect(result[1]).toEqual({ role: 'assistant', content: 'hello back' })
  })

  it('includes system messages as role:user when no workspaceId provided (backward-compat)', async () => {
    mockServiceFrom.mockReturnValueOnce(makeChain([
      { author_type: 'system', author_id: 'any-id', content: 'PR opened' },
    ]))
    const { buildMessageHistory } = await import('@/lib/bots/context')
    const result = await buildMessageHistory('channel-1')
    expect(result).toEqual([{ role: 'user', content: 'PR opened' }])
  })

  it('includes trigger system messages (author_id === workspaceId) when workspaceId provided', async () => {
    mockServiceFrom.mockReturnValueOnce(makeChain([
      { author_type: 'system', author_id: WORKSPACE_ID, content: 'Pull request #42 opened' },
    ]))
    const { buildMessageHistory } = await import('@/lib/bots/context')
    const result = await buildMessageHistory('channel-1', 20, WORKSPACE_ID)
    expect(result).toEqual([{ role: 'user', content: 'Pull request #42 opened' }])
  })

  it('includes handoff trigger messages (author_id === null UUID) when workspaceId provided', async () => {
    mockServiceFrom.mockReturnValueOnce(makeChain([
      { author_type: 'system', author_id: TRIGGER_UUID, content: '🚀 Feature X is ready for stage 3' },
    ]))
    const { buildMessageHistory } = await import('@/lib/bots/context')
    const result = await buildMessageHistory('channel-1', 20, WORKSPACE_ID)
    expect(result).toEqual([{ role: 'user', content: '🚀 Feature X is ready for stage 3' }])
  })

  it('excludes confirmation/error system messages (author_id === bot UUID) when workspaceId provided', async () => {
    mockServiceFrom.mockReturnValueOnce(makeChain([
      { author_type: 'user', author_id: 'user-uuid', content: 'hello' },
      { author_type: 'system', author_id: 'bot-role-uuid', content: '✓ Decision recorded: use React' },
      { author_type: 'system', author_id: 'bot-role-uuid', content: 'Something went wrong on my end.' },
    ]))
    const { buildMessageHistory } = await import('@/lib/bots/context')
    const result = await buildMessageHistory('channel-1', 20, WORKSPACE_ID)
    // Only the user message survives — system confirmation/error messages are excluded
    expect(result).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('keeps most recent when consecutive same-role messages appear', async () => {
    // DB newest-first → reverse → [first, second]; second is kept (most recent)
    mockServiceFrom.mockReturnValueOnce(makeChain([
      { author_type: 'user', content: 'second' }, // newest
      { author_type: 'user', content: 'first' },   // oldest
    ]))
    const { buildMessageHistory } = await import('@/lib/bots/context')
    const result = await buildMessageHistory('channel-1')
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('second')
  })

  it('recovers a poisoned channel — N unanswered user messages collapse to most recent', async () => {
    // Simulates a channel where record_decision fired 3× with no bot reply stored.
    // DB newest-first → after reverse: [msg1, msg2, msg3, bot-reply, msg4]
    mockServiceFrom.mockReturnValueOnce(makeChain([
      { author_type: 'user', author_id: 'user-uuid', content: 'msg4 most recent ask' }, // newest
      { author_type: 'bot', author_id: 'bot-uuid', content: 'got it' },
      { author_type: 'user', author_id: 'user-uuid', content: 'msg3 unanswered' },
      { author_type: 'user', author_id: 'user-uuid', content: 'msg2 unanswered' },
      { author_type: 'user', author_id: 'user-uuid', content: 'msg1 oldest' },
    ]))
    const { buildMessageHistory } = await import('@/lib/bots/context')
    const result = await buildMessageHistory('channel-1')
    // msg1+msg2+msg3 collapse to msg3; then bot-reply; then msg4 → 3 turns total
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ role: 'user', content: 'msg3 unanswered' })
    expect(result[1]).toEqual({ role: 'assistant', content: 'got it' })
    expect(result[2]).toEqual({ role: 'user', content: 'msg4 most recent ask' })
  })

  it('drops leading assistant turns (Claude requires user first)', async () => {
    // DB returns newest-first, so reversed = bot first then user
    mockServiceFrom.mockReturnValueOnce(makeChain([
      { author_type: 'user', content: 'then user spoke' },   // newest
      { author_type: 'bot', content: 'bot spoke first' },     // oldest
    ]))
    const { buildMessageHistory } = await import('@/lib/bots/context')
    const result = await buildMessageHistory('channel-1')
    // After reverse: bot first → dropped. Only user message remains.
    expect(result[0].role).toBe('user')
    expect(result.some((m) => m.role === 'assistant' && result.indexOf(m) === 0)).toBe(false)
  })

  it('preserves alternating user/assistant turns correctly', async () => {
    mockServiceFrom.mockReturnValueOnce(makeChain([
      { author_type: 'bot', content: 'reply' },   // newest
      { author_type: 'user', content: 'ask' },     // oldest
    ]))
    const { buildMessageHistory } = await import('@/lib/bots/context')
    const result = await buildMessageHistory('channel-1')
    expect(result).toEqual([
      { role: 'user', content: 'ask' },
      { role: 'assistant', content: 'reply' },
    ])
  })

  it('filters out messages with unknown author_type', async () => {
    mockServiceFrom.mockReturnValueOnce(makeChain([
      { author_type: 'webhook', content: 'should be filtered' },
      { author_type: 'user', content: 'hello' },
    ]))
    const { buildMessageHistory } = await import('@/lib/bots/context')
    const result = await buildMessageHistory('channel-1')
    // After reverse: [user:'hello', webhook:'should be filtered']
    // webhook is filtered out, only user message remains
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ role: 'user', content: 'hello' })
  })

  it('throws when the DB query fails', async () => {
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    })
    const { buildMessageHistory } = await import('@/lib/bots/context')
    await expect(buildMessageHistory('channel-1')).rejects.toThrow('Failed to fetch message history')
  })
})
