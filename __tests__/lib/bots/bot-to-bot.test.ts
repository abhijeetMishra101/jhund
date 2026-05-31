import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockServiceFrom = vi.hoisted(() => vi.fn())
const mockRespondToMessage = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: mockServiceFrom }),
}))

// messageTeammate uses a dynamic import to avoid circular dep — mock the module
vi.mock('@/lib/bots/index', () => ({
  respondToMessage: mockRespondToMessage,
}))

const WORKSPACE_ID = 'ws-uuid'
const CALLING_BOT_ID = 'caller-bot-uuid'
const CALLING_BOT_NAME = 'Sam'
const TARGET_ROLE = 'design'
const TARGET_CHANNEL_ID = 'design-channel-uuid'
const REPLY_MESSAGE_ID = 'reply-msg-uuid'
const REPLY_CONTENT = 'Use a two-column layout with sidebar nav.'

function setupChannelMembersMock(channelId = TARGET_CHANNEL_ID) {
  // Chain: .select().eq().eq().eq().eq().eq() — 5 chained .eq() calls
  const eqChain = {
    eq: vi.fn(),
    then: undefined as unknown,
  }
  eqChain.eq.mockReturnValue(eqChain)
  // Final .eq() resolves with data
  let callCount = 0
  eqChain.eq.mockImplementation(() => {
    callCount++
    if (callCount >= 5) {
      return Promise.resolve({ data: [{ channel_id: channelId }], error: null })
    }
    return eqChain
  })
  mockServiceFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue(eqChain),
  })
}

function setupMessageInsertMock(messageId = 'posted-msg-uuid') {
  mockServiceFrom.mockReturnValueOnce({
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: messageId }, error: null }),
    }),
  })
}

function setupReplyFetchMock(content = REPLY_CONTENT) {
  mockServiceFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { content }, error: null }),
  })
}

describe('messageTeammate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
  })

  it('happy path: finds target channel, posts message, calls respondToMessage, returns reply content', async () => {
    setupChannelMembersMock()
    setupMessageInsertMock()
    mockRespondToMessage.mockResolvedValue(REPLY_MESSAGE_ID)
    setupReplyFetchMock()

    const { messageTeammate } = await import('@/lib/bots/bot-to-bot')
    const reply = await messageTeammate(CALLING_BOT_ID, CALLING_BOT_NAME, TARGET_ROLE, 'What layout?', WORKSPACE_ID)

    expect(reply).toBe(REPLY_CONTENT)
    // respondToMessage called with target channel + isBotToBotCall=true
    expect(mockRespondToMessage).toHaveBeenCalledWith(
      TARGET_CHANNEL_ID,
      WORKSPACE_ID,
      undefined,
      'What layout?',
      true
    )
  })

  it('throws when no target channel found for the role', async () => {
    // channel_members returns empty array
    const eqChain = { eq: vi.fn() }
    eqChain.eq.mockImplementation(() => {
      let count = 0
      const inner = { eq: vi.fn().mockImplementation(() => { count++; return count >= 4 ? Promise.resolve({ data: [], error: null }) : inner }) }
      return inner
    })
    mockServiceFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue(eqChain) })

    const { messageTeammate } = await import('@/lib/bots/bot-to-bot')
    await expect(
      messageTeammate(CALLING_BOT_ID, CALLING_BOT_NAME, 'nonexistent', 'Hello?', WORKSPACE_ID)
    ).rejects.toThrow('No nonexistent channel found in this workspace')
  })

  it('throws when no rows returned from channel_members (null data)', async () => {
    const eqChain = { eq: vi.fn() }
    eqChain.eq.mockImplementation(() => {
      let count = 0
      const inner = { eq: vi.fn().mockImplementation(() => { count++; return count >= 4 ? Promise.resolve({ data: null, error: null }) : inner }) }
      return inner
    })
    mockServiceFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue(eqChain) })

    const { messageTeammate } = await import('@/lib/bots/bot-to-bot')
    await expect(
      messageTeammate(CALLING_BOT_ID, CALLING_BOT_NAME, TARGET_ROLE, 'Hello?', WORKSPACE_ID)
    ).rejects.toThrow(`No ${TARGET_ROLE} channel found in this workspace`)
  })

  it('throws when message insert fails', async () => {
    setupChannelMembersMock()
    // Insert fails
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB write failed' } }),
      }),
    })

    const { messageTeammate } = await import('@/lib/bots/bot-to-bot')
    await expect(
      messageTeammate(CALLING_BOT_ID, CALLING_BOT_NAME, TARGET_ROLE, 'Hello?', WORKSPACE_ID)
    ).rejects.toThrow('Failed to post message to design channel: DB write failed')
  })

  it('posted message includes calling bot name as author label', async () => {
    setupChannelMembersMock()
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'posted-msg' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: insertMock })
    mockRespondToMessage.mockResolvedValue(REPLY_MESSAGE_ID)
    setupReplyFetchMock()

    const { messageTeammate } = await import('@/lib/bots/bot-to-bot')
    await messageTeammate(CALLING_BOT_ID, CALLING_BOT_NAME, TARGET_ROLE, 'My question', WORKSPACE_ID)

    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload.author_id).toBe(CALLING_BOT_ID)
    expect(payload.author_type).toBe('bot')
    expect(payload.content).toBe(`**${CALLING_BOT_NAME}:** My question`)
    expect(payload.channel_id).toBe(TARGET_CHANNEL_ID)
  })
})
