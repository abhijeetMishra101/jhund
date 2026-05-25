/**
 * Tests for recordDecision()
 *
 * UC-19-01: recordDecision inserts a row and returns it
 * UC-19-02: DB error from insert → throws with message
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockFrom }),
}))

const PARAMS = {
  workspaceId: 'ws-1',
  channelId: 'ch-1',
  botRoleId: 'bot-1',
  title: 'Use TypeScript strict mode',
  summary: 'All new files must use strict TypeScript to catch null errors at compile time.',
  action: 'Open a PR enabling strictNullChecks in tsconfig.json',
}

const RETURNED_ROW = {
  id: 'dec-1',
  workspace_id: 'ws-1',
  channel_id: 'ch-1',
  bot_role_id: 'bot-1',
  title: PARAMS.title,
  summary: PARAMS.summary,
  action: PARAMS.action,
  action_dispatched_at: null,
  created_at: '2026-05-26T00:00:00.000Z',
}

function makeInsertChain(returnValue: { data: unknown; error: unknown }) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(returnValue),
      }),
    }),
  }
}

describe('recordDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
  })

  it('UC-19-01: happy path — inserts row and returns it', async () => {
    mockFrom.mockReturnValueOnce(makeInsertChain({ data: RETURNED_ROW, error: null }))

    const { recordDecision } = await import('@/lib/decisions/record')
    const result = await recordDecision(PARAMS)

    expect(result).toEqual(RETURNED_ROW)

    // Verify the insert was called with the right shape
    const insertFn = mockFrom.mock.results[0].value.insert
    expect(insertFn).toHaveBeenCalledWith({
      workspace_id: PARAMS.workspaceId,
      channel_id: PARAMS.channelId,
      bot_role_id: PARAMS.botRoleId,
      title: PARAMS.title,
      summary: PARAMS.summary,
      action: PARAMS.action,
    })
  })

  it('UC-19-01b: action defaults to null when not provided', async () => {
    const paramsNoAction = { ...PARAMS }
    delete (paramsNoAction as { action?: string }).action

    const rowNoAction = { ...RETURNED_ROW, action: null }
    mockFrom.mockReturnValueOnce(makeInsertChain({ data: rowNoAction, error: null }))

    const { recordDecision } = await import('@/lib/decisions/record')
    const result = await recordDecision(paramsNoAction)

    expect(result.action).toBeNull()

    const insertFn = mockFrom.mock.results[0].value.insert
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ action: null })
    )
  })

  it('UC-19-02: DB error → throws with message', async () => {
    mockFrom.mockReturnValueOnce(
      makeInsertChain({ data: null, error: { message: 'violates foreign key constraint' } })
    )

    const { recordDecision } = await import('@/lib/decisions/record')
    await expect(recordDecision(PARAMS)).rejects.toThrow('violates foreign key constraint')
  })

  it('UC-19-02b: no data returned → throws generic error', async () => {
    mockFrom.mockReturnValueOnce(makeInsertChain({ data: null, error: null }))

    const { recordDecision } = await import('@/lib/decisions/record')
    await expect(recordDecision(PARAMS)).rejects.toThrow('Failed to record decision')
  })
})
