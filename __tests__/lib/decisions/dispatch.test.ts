/**
 * Tests for postDecisionMessage() and markDecisionDispatched()
 *
 * UC-19-03: postDecisionMessage finds #decisions channel, posts message, returns IDs
 * UC-19-04: no #decisions channel in workspace → returns null
 * UC-19-05: markDecisionDispatched updates action_dispatched_at
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockFrom }),
}))

describe('postDecisionMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
  })

  it('UC-19-03: finds #decisions channel, posts message, returns { decisionsChannelId, messageId }', async () => {
    // 1. channels query → finds #decisions
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'ch-decisions' }, error: null }),
          }),
        }),
      }),
    })

    // 2. bot_roles query → returns bot name
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { display_name: 'Alex' }, error: null }),
        }),
      }),
    })

    // 3. messages insert → returns message id
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'msg-1' }, error: null }),
        }),
      }),
    })

    const { postDecisionMessage } = await import('@/lib/decisions/dispatch')
    const result = await postDecisionMessage('ws-1', 'Add rate limiting', 'bot-1')

    expect(result).toEqual({
      decisionsChannelId: 'ch-decisions',
      messageId: 'msg-1',
    })

    // Verify message content includes bot name
    const insertFn = mockFrom.mock.results[2].value.insert
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'ch-decisions',
        author_type: 'bot',
        content: 'Alex decided: Add rate limiting',
      })
    )
  })

  it('UC-19-04: no #decisions channel → returns null', async () => {
    // channels query → not found
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
          }),
        }),
      }),
    })

    const { postDecisionMessage } = await import('@/lib/decisions/dispatch')
    const result = await postDecisionMessage('ws-no-decisions', 'Do something', 'bot-1')

    expect(result).toBeNull()
    // Only one DB call (channels lookup), no messages insert
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('UC-19-03b: bot name falls back to "A bot" if bot_roles not found', async () => {
    // channels query → found
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'ch-decisions' }, error: null }),
          }),
        }),
      }),
    })

    // bot_roles query → not found
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })

    // messages insert → success
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'msg-2' }, error: null }),
        }),
      }),
    })

    const { postDecisionMessage } = await import('@/lib/decisions/dispatch')
    const result = await postDecisionMessage('ws-1', 'Some action', 'bot-unknown')

    expect(result?.messageId).toBe('msg-2')

    const insertFn = mockFrom.mock.results[2].value.insert
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'A bot decided: Some action' })
    )
  })
})

describe('markDecisionDispatched', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
  })

  it('UC-19-05: updates action_dispatched_at for the given decision id', async () => {
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    mockFrom.mockReturnValueOnce({ update: updateFn })

    const { markDecisionDispatched } = await import('@/lib/decisions/dispatch')
    await markDecisionDispatched('dec-1')

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ action_dispatched_at: expect.any(String) })
    )
  })
})
