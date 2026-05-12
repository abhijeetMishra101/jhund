/**
 * Phase 14 Backend Tests
 *
 * Covers:
 * 1. POST /api/messages with parent_id → validates parent and passes parent_id to respondToMessage
 * 2. GET /api/channels/[id]/threads/[messageId] → returns thread replies
 * 3. Standup cron: Riley's message is thread root, bot replies have correct parent_id
 *
 * Note: Multi-bot routing tests are in __tests__/api/phase14-routing.test.ts
 * (separate file required because they need the real @/lib/bots module, not the mock)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared hoisted mocks ──────────────────────────────────────────────────────

const mockGetUser = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())
const mockAnthropicCreate = vi.hoisted(() => vi.fn())
const mockRespondToMessage = vi.hoisted(() => vi.fn().mockResolvedValue('bot-reply-id'))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], get: () => null }),
}))
vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn((p: Promise<unknown>) => p),
}))
vi.mock('@/lib/bots', () => ({
  respondToMessage: mockRespondToMessage,
  ActionCapExceededError: class ActionCapExceededError extends Error {},
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockAnthropicCreate }
  },
}))

// ── Constants ─────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid'
const WORKSPACE_ID = 'ws-uuid'
const CHANNEL_ID = 'ch-uuid'
const PARENT_MSG_ID = 'parent-msg-id'
const SAM_BOT_ID = 'bot-sam-id'
const CASEY_BOT_ID = 'bot-casey-id' // used in thread reply fixtures

// ── Helpers ───────────────────────────────────────────────────────────────────

function singleChain(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: data ? null : { message: 'not found' } }),
  }
}

function listChain(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
}

function insertReturnChain(data: unknown) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data, error: null }),
    }),
  }
}

function makePostReq(body: unknown) {
  return new Request('http://localhost/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── 1. POST /api/messages with parent_id ─────────────────────────────────────

describe('POST /api/messages — parent_id (thread reply)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReset()
  })

  it('returns 201 and calls respondToMessage with parent_id', async () => {
    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))   // users
      .mockReturnValueOnce(singleChain({ id: CHANNEL_ID }))               // channel anti-IDOR
      .mockReturnValueOnce(singleChain({ id: PARENT_MSG_ID }))            // parent msg validation
      .mockReturnValueOnce(insertReturnChain({ id: 'new-reply-id' }))     // messages insert

    const { POST } = await import('@/app/api/messages/route')
    const res = await POST(makePostReq({ channelId: CHANNEL_ID, content: 'reply text', parent_id: PARENT_MSG_ID }))

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.id).toBe('new-reply-id')
    expect(mockRespondToMessage).toHaveBeenCalledWith(CHANNEL_ID, WORKSPACE_ID, PARENT_MSG_ID)
  })

  it('returns 404 when parent_id does not belong to the channel', async () => {
    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))   // users
      .mockReturnValueOnce(singleChain({ id: CHANNEL_ID }))               // channel
      .mockReturnValueOnce(singleChain(null))                              // parent not found

    const { POST } = await import('@/app/api/messages/route')
    const res = await POST(makePostReq({ channelId: CHANNEL_ID, content: 'reply', parent_id: 'wrong-parent' }))

    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toMatch(/parent/i)
  })

  it('inserts message with parent_id in payload', async () => {
    let capturedInsert: Record<string, unknown> | null = null
    const insertChain = {
      insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        capturedInsert = payload
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'msg-x' }, error: null }),
        }
      }),
    }

    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(singleChain({ id: CHANNEL_ID }))
      .mockReturnValueOnce(singleChain({ id: PARENT_MSG_ID }))
      .mockReturnValueOnce(insertChain)

    const { POST } = await import('@/app/api/messages/route')
    await POST(makePostReq({ channelId: CHANNEL_ID, content: 'thread reply', parent_id: PARENT_MSG_ID }))

    expect(capturedInsert).not.toBeNull()
    expect(capturedInsert!.parent_id).toBe(PARENT_MSG_ID)
  })
})

// ── 2. GET /api/channels/[id]/threads/[messageId] ───────────────────────────

describe('GET /api/channels/[id]/threads/[messageId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockServiceFrom.mockReset()
  })

  it('returns thread replies for a given parent message', async () => {
    const replies = [
      { id: 'r-1', channel_id: CHANNEL_ID, parent_id: PARENT_MSG_ID, author_type: 'bot', author_id: SAM_BOT_ID, content: 'Working on auth.', plan_id: null, reply_count: 0, created_at: '2024-01-01T01:00:00Z' },
      { id: 'r-2', channel_id: CHANNEL_ID, parent_id: PARENT_MSG_ID, author_type: 'bot', author_id: CASEY_BOT_ID, content: 'Running tests.', plan_id: null, reply_count: 0, created_at: '2024-01-01T02:00:00Z' },
    ]

    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))  // users
      .mockReturnValueOnce(singleChain({ id: CHANNEL_ID }))              // channel anti-IDOR
      .mockReturnValueOnce(listChain(replies))                            // thread replies

    const { GET } = await import('@/app/api/channels/[id]/threads/[messageId]/route')
    const res = await GET(
      new Request(`http://localhost/api/channels/${CHANNEL_ID}/threads/${PARENT_MSG_ID}`),
      { params: Promise.resolve({ id: CHANNEL_ID, messageId: PARENT_MSG_ID }) }
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.messages).toHaveLength(2)
    expect(json.messages[0].id).toBe('r-1')
    expect(json.messages[1].id).toBe('r-2')
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const { GET } = await import('@/app/api/channels/[id]/threads/[messageId]/route')
    const res = await GET(
      new Request(`http://localhost/api/channels/${CHANNEL_ID}/threads/${PARENT_MSG_ID}`),
      { params: Promise.resolve({ id: CHANNEL_ID, messageId: PARENT_MSG_ID }) }
    )

    expect(res.status).toBe(401)
  })

  it('returns 404 when channel does not belong to workspace', async () => {
    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(singleChain(null))  // channel not found

    const { GET } = await import('@/app/api/channels/[id]/threads/[messageId]/route')
    const res = await GET(
      new Request(`http://localhost/api/channels/other-channel/threads/${PARENT_MSG_ID}`),
      { params: Promise.resolve({ id: 'other-channel', messageId: PARENT_MSG_ID }) }
    )

    expect(res.status).toBe(404)
  })

  it('returns empty array when no replies exist', async () => {
    mockServiceFrom
      .mockReturnValueOnce(singleChain({ workspace_id: WORKSPACE_ID }))
      .mockReturnValueOnce(singleChain({ id: CHANNEL_ID }))
      .mockReturnValueOnce(listChain([]))

    const { GET } = await import('@/app/api/channels/[id]/threads/[messageId]/route')
    const res = await GET(
      new Request(`http://localhost/api/channels/${CHANNEL_ID}/threads/${PARENT_MSG_ID}`),
      { params: Promise.resolve({ id: CHANNEL_ID, messageId: PARENT_MSG_ID }) }
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.messages).toEqual([])
  })
})

// ── 3. Standup: Riley is thread root, replies have parent_id ─────────────────

describe('Standup cron — thread consolidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockServiceFrom.mockReset()
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Working on auth today.' }],
    })
  })

  const RILEY_MSG_ID = 'riley-opening-id'
  const BOT = { id: 'bot-sam', display_name: 'Sam', system_prompt: 'You are Sam.' }

  it('Riley opening message has no parent_id (is the thread root)', async () => {
    let openingPayload: Record<string, unknown> | null = null

    const openingInsert = {
      insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        openingPayload = payload
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: RILEY_MSG_ID }, error: null }),
        }
      }),
    }

    mockServiceFrom
      .mockReturnValueOnce({ select: vi.fn().mockResolvedValue({ data: [{ id: 'ws-1' }], error: null }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'ch-standup' }, error: null }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'riley-id', display_name: 'Riley', system_prompt: 'Riley prompt' }, error: null }) })
      .mockReturnValueOnce(openingInsert)
      .mockReturnValueOnce({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockResolvedValue({ data: [BOT], error: null }) })
      .mockReturnValueOnce({ insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'prompt-id' }, error: null }) }) })
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })
      .mockReturnValueOnce({ delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) })
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })
      .mockReturnValueOnce({ update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) })

    const { runStandup } = await import('@/lib/crons/standup')
    await runStandup()

    expect(openingPayload).not.toBeNull()
    expect((openingPayload as unknown as Record<string, unknown>).parent_id).toBeUndefined()
  })

  it('bot standup replies have parent_id = riley opening message id', async () => {
    const insertPayloads: Array<Record<string, unknown>> = []

    const trackInsert = (returnId: string | null = null) => ({
      insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        insertPayloads.push(payload)
        if (returnId) {
          return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: returnId }, error: null }) }
        }
        return Promise.resolve({ error: null })
      }),
    })

    mockServiceFrom
      .mockReturnValueOnce({ select: vi.fn().mockResolvedValue({ data: [{ id: 'ws-1' }], error: null }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'ch-standup' }, error: null }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'riley-id', display_name: 'Riley', system_prompt: 'Riley prompt' }, error: null }) })
      .mockReturnValueOnce(trackInsert(RILEY_MSG_ID))     // opening msg → tracked
      .mockReturnValueOnce({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockResolvedValue({ data: [BOT], error: null }) })
      .mockReturnValueOnce(trackInsert('prompt-id'))      // prompt → tracked
      .mockReturnValueOnce(trackInsert())                 // bot update → tracked
      .mockReturnValueOnce({ delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) })
      .mockReturnValueOnce(trackInsert())                 // riley summary → tracked
      .mockReturnValueOnce({ update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) })

    const { runStandup } = await import('@/lib/crons/standup')
    await runStandup()

    // insertPayloads[0] = opening (no parent_id)
    // insertPayloads[1] = prompt (with parent_id)
    // insertPayloads[2] = bot update (with parent_id = RILEY_MSG_ID)
    // insertPayloads[3] = riley summary (with parent_id = RILEY_MSG_ID)
    expect(insertPayloads[2]?.parent_id).toBe(RILEY_MSG_ID)
    expect(insertPayloads[3]?.parent_id).toBe(RILEY_MSG_ID)
  })
})
