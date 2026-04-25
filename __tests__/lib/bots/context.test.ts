import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServiceFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))

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

  it('maps system messages to role:user', async () => {
    mockServiceFrom.mockReturnValueOnce(makeChain([
      { author_type: 'system', content: 'PR opened' },
    ]))
    const { buildMessageHistory } = await import('@/lib/bots/context')
    const result = await buildMessageHistory('channel-1')
    expect(result).toEqual([{ role: 'user', content: 'PR opened' }])
  })

  it('merges consecutive same-role messages', async () => {
    // DB newest-first → reverse → [first, second]
    mockServiceFrom.mockReturnValueOnce(makeChain([
      { author_type: 'user', content: 'second' }, // newest
      { author_type: 'user', content: 'first' },   // oldest
    ]))
    const { buildMessageHistory } = await import('@/lib/bots/context')
    const result = await buildMessageHistory('channel-1')
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('first\n\nsecond')
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
