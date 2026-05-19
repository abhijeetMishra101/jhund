import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted: variables referenced inside vi.mock factories ────────────────
const mockMessagesCreate = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

// ── Module mocks (hoisted before imports) ────────────────────────────────────
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockMessagesCreate }
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({}),
  createServiceClient: vi.fn().mockReturnValue({
    from: mockServiceFrom,
    rpc: mockRpc,
  }),
}))

// Mock context so we don't have to wire up the full message-history chain
vi.mock('@/lib/bots/context', () => ({
  buildMessageHistory: vi.fn().mockResolvedValue([
    { role: 'user', content: 'open an issue please' },
  ]),
}))

// ── Test data ────────────────────────────────────────────────────────────────
const CHANNEL_ID = 'channel-uuid'
const WORKSPACE_ID = 'workspace-uuid'
const BOT_ROLE = {
  id: 'bot-role-uuid',
  workspace_id: WORKSPACE_ID,
  role_key: 'engineer',
  display_name: 'Sam',
  system_prompt: 'You are Sam.',
  avatar_seed: 'sam',
  status: 'online' as const,
  status_updated_at: null,
  created_at: '2024-01-01T00:00:00Z',
}

// Canonical new-format tool use response (single action)
function toolUseResponse(actionType: string, payload: Record<string, unknown>, description = 'Do something on GitHub') {
  return {
    content: [
      {
        type: 'tool_use',
        name: 'propose_github_action',
        input: {
          plain_english_description: description,
          actions: [{ action_type: actionType, payload }],
        },
      },
    ],
    stop_reason: 'tool_use',
  }
}

/**
 * Standard bot-resolution mocks for `resolveBotForMessage`:
 *   1. channel_members: .select().eq().order() → [{ bot_role_id, is_primary }]
 *   2. bot_roles:       .select().in()         → [BOT_ROLE]
 */
function setupBotResolutionMocks(memberRows = [{ bot_role_id: BOT_ROLE.id, is_primary: true }]) {
  // channel_members chain
  mockServiceFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: memberRows, error: null }),
  })
  // bot_roles chain
  mockServiceFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: memberRows.length > 0 ? [BOT_ROLE] : [], error: null }),
  })
}

/** Messages insert chain */
function messagesInsertChain(id: string) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
    }),
  }
}

/** Failing insert chain */
function failingInsertChain(errorMsg: string) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: errorMsg } }),
    }),
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('respondToMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores a plain-text reply and returns message id', async () => {
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-uuid'))

    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello there!' }],
      stop_reason: 'end_turn',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)
    expect(id).toBe('msg-uuid')
    expect(mockMessagesCreate).toHaveBeenCalledOnce()
  })

  it('plain-text reply is stored without plan_id', async () => {
    let insertedPayload: Record<string, unknown> | null = null

    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        insertedPayload = payload
        return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'msg-uuid' }, error: null }) }
      }),
    })

    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello!' }],
      stop_reason: 'end_turn',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    await respondToMessage(CHANNEL_ID, WORKSPACE_ID)
    expect((insertedPayload as Record<string, unknown> | null)?.plan_id).toBeUndefined()
  })

  it('creates a plan row when Claude uses propose_github_action tool', async () => {
    const tablesWritten: string[] = []

    setupBotResolutionMocks()

    // plans insert
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation(() => {
        tablesWritten.push('plans')
        return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'plan-uuid' }, error: null }) }
      }),
    })
    // messages insert
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation(() => {
        tablesWritten.push('messages')
        return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'msg-uuid' }, error: null }) }
      }),
    })

    mockMessagesCreate.mockResolvedValue(
      toolUseResponse('create_issue', { title: 'Login fails', body: 'Steps…' }, 'Create a bug report titled "Login fails"')
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    await respondToMessage(CHANNEL_ID, WORKSPACE_ID)
    expect(tablesWritten).toContain('plans')
    expect(tablesWritten).toContain('messages')
  })

  it('stores github_actions as the actions array from the tool call', async () => {
    let storedPlanPayload: Record<string, unknown> | null = null

    setupBotResolutionMocks()

    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        storedPlanPayload = payload
        return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'plan-uuid' }, error: null }) }
      }),
    })
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-uuid'))

    mockMessagesCreate.mockResolvedValue(
      toolUseResponse('create_issue', { title: 'Bug', body: 'desc', labels: ['bug'] }, 'Open a bug report')
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(storedPlanPayload).not.toBeNull()
    expect(storedPlanPayload!.github_actions).toEqual([
      { action_type: 'create_issue', payload: { title: 'Bug', body: 'desc', labels: ['bug'] } },
    ])
  })

  it('stores multi-step github_actions for commit_file + create_pr in sequence', async () => {
    let storedPlanPayload: Record<string, unknown> | null = null

    setupBotResolutionMocks()

    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        storedPlanPayload = payload
        return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'plan-uuid' }, error: null }) }
      }),
    })
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-uuid'))

    // Sam proposes both steps in one tool call
    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'propose_github_action',
          input: {
            plain_english_description: 'Write README.md and open a pull request',
            actions: [
              { action_type: 'commit_file', payload: { file_path: 'README.md', content: '# Project', commit_message: 'Add README', branch: 'bot/add-readme' } },
              { action_type: 'create_pr', payload: { title: 'Add README.md', body: 'Adds a README', head_branch: 'bot/add-readme', base_branch: 'main' } },
            ],
          },
        },
      ],
      stop_reason: 'tool_use',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(storedPlanPayload!.github_actions).toEqual([
      { action_type: 'commit_file', payload: { file_path: 'README.md', content: '# Project', commit_message: 'Add README', branch: 'bot/add-readme' } },
      { action_type: 'create_pr', payload: { title: 'Add README.md', body: 'Adds a README', head_branch: 'bot/add-readme', base_branch: 'main' } },
    ])
  })

  it('links bot message to plan via plan_id when tool is used', async () => {
    let insertedMsg: Record<string, unknown> | null = null

    setupBotResolutionMocks()

    // plans insert
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'plan-uuid' }, error: null }),
      }),
    })
    // messages insert
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        insertedMsg = payload
        return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'msg-uuid' }, error: null }) }
      }),
    })

    mockMessagesCreate.mockResolvedValue(
      toolUseResponse('create_issue', { title: 'Bug', body: 'desc' }, 'Open bug report')
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    await respondToMessage(CHANNEL_ID, WORKSPACE_ID)
    expect(insertedMsg).not.toBeNull()
    expect(insertedMsg!.plan_id).toBe('plan-uuid')
    expect(insertedMsg!.content).toContain('Open bug report')
  })

  it('does NOT call increment_action_count — chat is free regardless of cap', async () => {
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-uuid'))

    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello!' }],
      stop_reason: 'end_turn',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    await respondToMessage(CHANNEL_ID, WORKSPACE_ID)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('throws when no bot is configured for the channel', async () => {
    // channel_members: empty → triggers fallback to channels
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    // channels fallback: no bot_role_id
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { bot_role_id: null }, error: null }),
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('No bot configured')
  })

  it('throws "No messages to respond to" when buildMessageHistory returns empty array', async () => {
    const { buildMessageHistory } = await import('@/lib/bots/context')
    vi.mocked(buildMessageHistory).mockResolvedValueOnce([])

    setupBotResolutionMocks()

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('No messages to respond to')
    expect(mockMessagesCreate).not.toHaveBeenCalled()
  })

  it('throws when tool is called with empty actions array', async () => {
    setupBotResolutionMocks()

    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'propose_github_action',
          input: { plain_english_description: 'Do something', actions: [] },
        },
      ],
      stop_reason: 'tool_use',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('empty actions array')
  })

  it('throws "Failed to create plan" when plan insert returns error', async () => {
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(failingInsertChain('DB insert failed'))

    mockMessagesCreate.mockResolvedValue(
      toolUseResponse('create_issue', { title: 'Bug', body: 'desc' }, 'Create a bug report')
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('Failed to create plan')
  })

  it('throws "Failed to store bot reply" when message insert fails after tool use', async () => {
    setupBotResolutionMocks()

    // plans insert succeeds
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'plan-uuid' }, error: null }),
      }),
    })
    // messages insert fails
    mockServiceFrom.mockReturnValueOnce(failingInsertChain('message insert failed'))

    mockMessagesCreate.mockResolvedValue(
      toolUseResponse('create_issue', { title: 'Bug', body: 'desc' }, 'Create a bug report')
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('Failed to store bot reply')
  })

  it('throws "Failed to store bot reply" when plain text message insert fails', async () => {
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(failingInsertChain('insert failed'))

    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello there!' }],
      stop_reason: 'end_turn',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('Failed to store bot reply')
  })

  it('throws when Claude returns empty text', async () => {
    setupBotResolutionMocks()

    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '   ' }],
      stop_reason: 'end_turn',
    })
    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('empty')
  })

  it('passes parent_id when parentMessageId is provided (thread reply — plain text)', async () => {
    setupBotResolutionMocks()

    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'thread-reply-id' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: insertMock })

    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Here is my thread reply.' }],
      stop_reason: 'end_turn',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID, 'parent-msg-id')

    expect(id).toBe('thread-reply-id')
    // Verify parent_id was included in the insert payload
    const insertPayload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertPayload.parent_id).toBe('parent-msg-id')
  })

  it('passes parent_id when parentMessageId is provided (thread reply — with plan)', async () => {
    setupBotResolutionMocks()

    // Plans insert chain
    const plansInsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'plan-uuid' },
        error: null,
      }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: plansInsertMock })

    // Messages insert chain
    const messagesInsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'thread-plan-reply-id' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: messagesInsertMock })

    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          id: 'tool-1',
          name: 'propose_github_action',
          input: {
            plain_english_description: 'Create an issue',
            actions: [{ action_type: 'create_issue', payload: { title: 'Bug', body: 'details', labels: [] } }],
          },
        },
      ],
      stop_reason: 'tool_use',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID, 'parent-msg-id')

    expect(id).toBe('thread-plan-reply-id')
    // Message insert should include parent_id
    const msgPayload = messagesInsertMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(msgPayload.parent_id).toBe('parent-msg-id')
  })

  // ── UC-5-02: First message ever sent ────────────────────────────────────────
  it('UC-5-02: responds when buildMessageHistory returns exactly one message (first message ever)', async () => {
    const { buildMessageHistory } = await import('@/lib/bots/context')
    vi.mocked(buildMessageHistory).mockResolvedValueOnce([
      { role: 'user', content: 'Hello team! Excited to get started.' },
    ])

    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('first-reply-id'))
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Welcome! I am ready to help you ship.' }],
      stop_reason: 'end_turn',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('first-reply-id')
    expect(mockMessagesCreate).toHaveBeenCalledOnce()
  })

  // ── UC-5-01: Graceful degradation — no GitHub installation ──────────────────
  it('UC-5-01: bot responds with plain text even when workspace has no GitHub installation', async () => {
    // respondToMessage does not check github_installation_id — that is only
    // checked at plan-execution time (plans/approve → executor). So the bot
    // must always be able to answer questions regardless of GitHub status.
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-no-github'))
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'I can advise, but GitHub actions need the integration set up first.' }],
      stop_reason: 'end_turn',
    })

    const NO_GITHUB_WORKSPACE_ID = 'ws-no-github-installation'
    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, NO_GITHUB_WORKSPACE_ID)

    // Bot must respond successfully — it does not throw due to missing GitHub installation
    expect(id).toBe('msg-no-github')
    expect(mockMessagesCreate).toHaveBeenCalledOnce()
  })
})

// ── UC-3-05: @mention routing in multi-bot channels ─────────────────────────

const SAM = {
  ...BOT_ROLE,
  id: 'sam-id',
  display_name: 'Sam',
  role_key: 'backend',
}
const CASEY = {
  ...BOT_ROLE,
  id: 'casey-id',
  display_name: 'Casey',
  role_key: 'qa',
}

function setupMultiBotChannel() {
  // channel_members: Sam is primary, Casey is not
  mockServiceFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({
      data: [
        { bot_role_id: 'sam-id', is_primary: true },
        { bot_role_id: 'casey-id', is_primary: false },
      ],
      error: null,
    }),
  })
  // bot_roles fetch
  mockServiceFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [SAM, CASEY], error: null }),
  })
}

describe('resolveBotForMessage — UC-3-05 @mention routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('@Casey routes to Casey even though Sam is primary', async () => {
    setupMultiBotChannel()
    const { resolveBotForMessage } = await import('@/lib/bots/index')
    const bot = await resolveBotForMessage(CHANNEL_ID, '@Casey run the full test suite please')
    expect(bot?.id).toBe('casey-id')
    expect(bot?.display_name).toBe('Casey')
  })

  it('@mention matching is case-insensitive — @casey routes to Casey', async () => {
    setupMultiBotChannel()
    const { resolveBotForMessage } = await import('@/lib/bots/index')
    const bot = await resolveBotForMessage(CHANNEL_ID, '@casey please check coverage')
    expect(bot?.id).toBe('casey-id')
  })

  it('@Sam explicitly routes to Sam (primary bot)', async () => {
    setupMultiBotChannel()
    const { resolveBotForMessage } = await import('@/lib/bots/index')
    const bot = await resolveBotForMessage(CHANNEL_ID, '@Sam review this PR')
    expect(bot?.id).toBe('sam-id')
  })

  it('unrecognised @mention falls back to primary bot', async () => {
    setupMultiBotChannel()
    const { resolveBotForMessage } = await import('@/lib/bots/index')
    // @Morgan is not in this channel → falls back to Sam (primary)
    const bot = await resolveBotForMessage(CHANNEL_ID, '@Morgan fix this')
    expect(bot?.id).toBe('sam-id')
  })

  it('no @mention → primary bot is selected', async () => {
    setupMultiBotChannel()
    const { resolveBotForMessage } = await import('@/lib/bots/index')
    const bot = await resolveBotForMessage(CHANNEL_ID, 'Can someone help me with auth?')
    expect(bot?.id).toBe('sam-id')
  })
})
