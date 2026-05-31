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

// New query has 3 chained .eq() calls:
//   .eq('channels.workspace_id', workspaceId)
//   .eq('channels.channel_type', 'channel')
//   .eq('bot_roles.role_key', targetRole)
function setupChannelMembersMock(rows: { channel_id: string; is_primary: boolean }[]) {
  const eqChain = { eq: vi.fn() }
  let callCount = 0
  eqChain.eq.mockImplementation(() => {
    callCount++
    if (callCount >= 3) {
      return Promise.resolve({ data: rows, error: null })
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
    setupChannelMembersMock([{ channel_id: TARGET_CHANNEL_ID, is_primary: true }])
    setupMessageInsertMock()
    mockRespondToMessage.mockResolvedValue(REPLY_MESSAGE_ID)
    setupReplyFetchMock()

    const { messageTeammate } = await import('@/lib/bots/bot-to-bot')
    const reply = await messageTeammate(CALLING_BOT_ID, CALLING_BOT_NAME, TARGET_ROLE, 'What layout?', WORKSPACE_ID)

    expect(reply).toBe(REPLY_CONTENT)
    expect(mockRespondToMessage).toHaveBeenCalledWith(
      TARGET_CHANNEL_ID,
      WORKSPACE_ID,
      undefined,
      'What layout?',
      true
    )
  })

  it('prefers primary membership when multiple channels exist for the role', async () => {
    const nonPrimaryChannelId = 'other-channel-uuid'
    setupChannelMembersMock([
      { channel_id: nonPrimaryChannelId, is_primary: false },
      { channel_id: TARGET_CHANNEL_ID, is_primary: true },
    ])
    setupMessageInsertMock()
    mockRespondToMessage.mockResolvedValue(REPLY_MESSAGE_ID)
    setupReplyFetchMock()

    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'posted-msg' }, error: null }),
    })
    // Replace the generic insert mock with a spy
    mockServiceFrom.mockReset()
    setupChannelMembersMock([
      { channel_id: nonPrimaryChannelId, is_primary: false },
      { channel_id: TARGET_CHANNEL_ID, is_primary: true },
    ])
    mockServiceFrom.mockReturnValueOnce({ insert: insertMock })
    mockRespondToMessage.mockResolvedValue(REPLY_MESSAGE_ID)
    setupReplyFetchMock()

    const { messageTeammate } = await import('@/lib/bots/bot-to-bot')
    await messageTeammate(CALLING_BOT_ID, CALLING_BOT_NAME, TARGET_ROLE, 'Hello?', WORKSPACE_ID)

    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload.channel_id).toBe(TARGET_CHANNEL_ID)
  })

  it('falls back to first row when no primary membership exists', async () => {
    const fallbackChannelId = 'fallback-channel-uuid'
    setupChannelMembersMock([{ channel_id: fallbackChannelId, is_primary: false }])
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'posted-msg' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: insertMock })
    mockRespondToMessage.mockResolvedValue(REPLY_MESSAGE_ID)
    setupReplyFetchMock()

    const { messageTeammate } = await import('@/lib/bots/bot-to-bot')
    await messageTeammate(CALLING_BOT_ID, CALLING_BOT_NAME, TARGET_ROLE, 'Hello?', WORKSPACE_ID)

    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload.channel_id).toBe(fallbackChannelId)
  })

  it('throws when no target channel found for the role', async () => {
    setupChannelMembersMock([])

    const { messageTeammate } = await import('@/lib/bots/bot-to-bot')
    await expect(
      messageTeammate(CALLING_BOT_ID, CALLING_BOT_NAME, 'nonexistent', 'Hello?', WORKSPACE_ID)
    ).rejects.toThrow('No nonexistent channel found in this workspace')
  })

  it('throws when no rows returned from channel_members (null data)', async () => {
    const eqChain = { eq: vi.fn() }
    let callCount = 0
    eqChain.eq.mockImplementation(() => {
      callCount++
      if (callCount >= 3) return Promise.resolve({ data: null, error: null })
      return eqChain
    })
    mockServiceFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue(eqChain) })

    const { messageTeammate } = await import('@/lib/bots/bot-to-bot')
    await expect(
      messageTeammate(CALLING_BOT_ID, CALLING_BOT_NAME, TARGET_ROLE, 'Hello?', WORKSPACE_ID)
    ).rejects.toThrow(`No ${TARGET_ROLE} channel found in this workspace`)
  })

  it('throws when message insert fails', async () => {
    setupChannelMembersMock([{ channel_id: TARGET_CHANNEL_ID, is_primary: true }])
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
    setupChannelMembersMock([{ channel_id: TARGET_CHANNEL_ID, is_primary: true }])
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
