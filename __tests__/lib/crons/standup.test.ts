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
const STANDUP_CH = 'ch-standup'
const RILEY_MSG_ID = 'riley-msg-id'
const BOT_ROLE_ID = 'bot-backend'
const OPS_BOT_ID = 'bot-ops'

// ── Chain helpers ─────────────────────────────────────────────────────────────

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
      data: found ? { id: OPS_BOT_ID, display_name: 'Riley', system_prompt: 'You are Riley.' } : null,
      error: null,
    }),
  }
}

/** insert chain that returns a single row (e.g. for opening message with id) */
function insertReturningChain(id: string) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
    }),
  }
}

/** insert chain with no return needed (fire-and-forget) */
function insertChain() {
  return { insert: vi.fn().mockResolvedValue({ error: null }) }
}

/** chain for delete */
function deleteChain() {
  return { delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
}

function updateChain() {
  return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
}

function allBotsChain(bots: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockResolvedValue({ data: bots, error: null }),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runStandup (Phase 14 — thread consolidation)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockServiceFrom.mockReset()
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Working on auth today.' }],
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
  })

  it('posts opening message, bot thread replies, then Riley summary thread reply', async () => {
    const bot = { id: BOT_ROLE_ID, display_name: 'Sam', system_prompt: 'You are Sam.' }

    const insertMsgMock = vi.fn()

    // opening message insert returns riley_msg_id
    const openingInsertChain = {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: RILEY_MSG_ID }, error: null }),
      }),
    }

    // prompt message insert returns a prompt msg id
    const promptInsertChain = {
      insert: insertMsgMock.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'prompt-msg-id' }, error: null }),
      }),
    }

    // bot update insert (no return needed)
    const botUpdateChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }

    // summary insert (no return needed)
    const summaryInsertChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }

    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))         // 1. workspaces
      .mockReturnValueOnce(standupChannelChain(true))          // 2. standup channel
      .mockReturnValueOnce(rileyChain(true))                   // 3. riley
      .mockReturnValueOnce(openingInsertChain)                 // 4. Riley opening msg
      .mockReturnValueOnce(allBotsChain([bot]))                // 5. all bots (excl ops)
      .mockReturnValueOnce(promptInsertChain)                  // 6. system prompt msg insert
      .mockReturnValueOnce(botUpdateChain)                     // 7. bot update insert as thread reply
      .mockReturnValueOnce(deleteChain())                      // 8. delete prompt msg
      .mockReturnValueOnce(summaryInsertChain)                 // 9. Riley summary thread reply
      .mockReturnValueOnce(updateChain())                      // 10. last_standup_at update

    const { runStandup } = await import('@/lib/crons/standup')
    const result = await runStandup()

    expect(result.workspaces).toBe(1)
    // Anthropic called twice: once per bot standup, once for digest
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(2)
  })

  it('posts quiet-morning digest when no bots found', async () => {
    const openingInsertChain = {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: RILEY_MSG_ID }, error: null }),
      }),
    }

    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(standupChannelChain(true))
      .mockReturnValueOnce(rileyChain(true))
      .mockReturnValueOnce(openingInsertChain)
      .mockReturnValueOnce(allBotsChain([]))        // no bots
      .mockReturnValueOnce(updateChain())            // last_standup_at

    const { runStandup } = await import('@/lib/crons/standup')
    await runStandup()
    // Should not call Claude at all when there are no bots
    expect(mockAnthropicCreate).not.toHaveBeenCalled()
  })

  it('returns correct workspaces count for multiple workspaces', async () => {
    mockServiceFrom
      .mockReturnValueOnce(workspacesChain(['ws-1', 'ws-2']))
      .mockReturnValueOnce(standupChannelChain(false))
      .mockReturnValueOnce(standupChannelChain(false))

    const { runStandup } = await import('@/lib/crons/standup')
    const result = await runStandup()
    expect(result.workspaces).toBe(2)
  })

  it('handles workspace-level errors gracefully', async () => {
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

  it('Riley opening message has no parent_id (is thread root)', async () => {
    const bot = { id: BOT_ROLE_ID, display_name: 'Sam', system_prompt: 'You are Sam.' }

    let openingInsertPayload: Record<string, unknown> | null = null
    const openingInsertChain = {
      insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        openingInsertPayload = payload
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: RILEY_MSG_ID }, error: null }),
        }
      }),
    }

    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(standupChannelChain(true))
      .mockReturnValueOnce(rileyChain(true))
      .mockReturnValueOnce(openingInsertChain)
      .mockReturnValueOnce(allBotsChain([bot]))
      .mockReturnValueOnce({ insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'p-id' }, error: null }) }) })
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })
      .mockReturnValueOnce(deleteChain())
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })
      .mockReturnValueOnce(updateChain())

    const { runStandup } = await import('@/lib/crons/standup')
    await runStandup()

    // Opening message must NOT have parent_id
    expect(openingInsertPayload).not.toBeNull()
    expect((openingInsertPayload as unknown as Record<string, unknown>).parent_id).toBeUndefined()
  })

  it('bot thread reply has parent_id = riley opening message id', async () => {
    const bot = { id: BOT_ROLE_ID, display_name: 'Sam', system_prompt: 'You are Sam.' }

    const insertCalls: Array<Record<string, unknown>> = []

    const trackingInsertChain = (returnId: string | null = null) => ({
      insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        insertCalls.push(payload)
        if (returnId) {
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: returnId }, error: null }),
          }
        }
        return Promise.resolve({ error: null })
      }),
    })

    mockServiceFrom
      .mockReturnValueOnce(workspacesChain([WS_ID]))
      .mockReturnValueOnce(standupChannelChain(true))
      .mockReturnValueOnce(rileyChain(true))
      .mockReturnValueOnce(trackingInsertChain(RILEY_MSG_ID))  // opening msg
      .mockReturnValueOnce(allBotsChain([bot]))
      .mockReturnValueOnce(trackingInsertChain('prompt-id'))   // prompt insert
      .mockReturnValueOnce(trackingInsertChain())              // bot update insert
      .mockReturnValueOnce(deleteChain())
      .mockReturnValueOnce(trackingInsertChain())              // riley summary
      .mockReturnValueOnce(updateChain())

    const { runStandup } = await import('@/lib/crons/standup')
    await runStandup()

    // Bot update (3rd insert call) should have parent_id = riley msg id
    const botUpdateInsert = insertCalls[2]
    expect(botUpdateInsert?.parent_id).toBe(RILEY_MSG_ID)

    // Riley summary (4th insert call) should also have parent_id = riley msg id
    const summaryInsert = insertCalls[3]
    expect(summaryInsert?.parent_id).toBe(RILEY_MSG_ID)
  })
})
