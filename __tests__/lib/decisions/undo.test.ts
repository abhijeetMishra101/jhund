/**
 * Tests for undoDecision()
 *
 * UC-19-11: happy path — no prior action dispatched
 * UC-19-14: action was already dispatched
 * UC-19-15: nothing to undo (no eligible decision found)
 * Fire-and-forget resilience: #decisions channel not found → still returns undone:true
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockFrom }),
}))

describe('undoDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
  })

  it('UC-19-11: soft-deletes decision, posts withdrawn notice, returns { undone: true, actionWasDispatched: false }', async () => {
    // Call 1: find most recent non-deleted decision
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'dec-1', title: 'Use PostgreSQL', action_dispatched_at: null },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    })

    // Call 2: soft-delete update
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    // Call 3 (fire-and-forget): channels query → finds #decisions
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'ch-decisions' },
              error: null,
            }),
          }),
        }),
      }),
    })

    // Call 4 (fire-and-forget): messages insert → withdrawn notice
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    const { undoDecision } = await import('@/lib/decisions/undo')
    const result = await undoDecision('ws-1', 'ch-1', 'bot-1')

    expect(result).toEqual({
      undone: true,
      title: 'Use PostgreSQL',
      actionWasDispatched: false,
    })

    // Flush fire-and-forget microtasks
    await new Promise((resolve) => setTimeout(resolve, 0))

    // All 4 DB calls should have been made
    expect(mockFrom).toHaveBeenCalledTimes(4)
  })

  it('UC-19-14: returns actionWasDispatched:true when action_dispatched_at is non-null', async () => {
    // Call 1: find decision — has action_dispatched_at set
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'dec-2',
                      title: 'Use PostgreSQL',
                      action_dispatched_at: '2026-01-01T10:00:00Z',
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    })

    // Call 2: soft-delete
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    // Call 3 (fire-and-forget): channels query
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'ch-decisions' }, error: null }),
          }),
        }),
      }),
    })

    // Call 4 (fire-and-forget): messages insert
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    const { undoDecision } = await import('@/lib/decisions/undo')
    const result = await undoDecision('ws-1', 'ch-1', 'bot-1')

    expect(result).toEqual({
      undone: true,
      title: 'Use PostgreSQL',
      actionWasDispatched: true,
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockFrom).toHaveBeenCalledTimes(4)
  })

  it('UC-19-15: returns { undone: false } and makes no update when no eligible decision found', async () => {
    // Call 1: decision query returns null
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    })

    const { undoDecision } = await import('@/lib/decisions/undo')
    const result = await undoDecision('ws-1', 'ch-1', 'bot-1')

    expect(result).toEqual({ undone: false })
    // Only the lookup — no update, no fire-and-forget
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('fire-and-forget: #decisions channel not found — still returns { undone: true }', async () => {
    // Call 1: find decision
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'dec-3', title: 'Ship it', action_dispatched_at: null },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    })

    // Call 2: soft-delete
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    // Call 3 (fire-and-forget): channels query → not found
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    })

    const { undoDecision } = await import('@/lib/decisions/undo')
    const result = await undoDecision('ws-1', 'ch-1', 'bot-1')

    // Must succeed even though the withdrawn notice won't be posted
    expect(result).toEqual({
      undone: true,
      title: 'Ship it',
      actionWasDispatched: false,
    })

    // Flush so the fire-and-forget can reach the early return after finding no channel
    await new Promise((resolve) => setTimeout(resolve, 0))

    // 3 calls: lookup + update + channels query (no messages insert since channel not found)
    expect(mockFrom).toHaveBeenCalledTimes(3)
  })
})
