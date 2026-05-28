import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted: variables referenced inside vi.mock factories ────────────────
const mockMessagesCreate = vi.hoisted(() => vi.fn())
const mockServiceFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())
const mockAdvanceStage = vi.hoisted(() => vi.fn())
const mockGetDispatchTargets = vi.hoisted(() => vi.fn())
const mockPostHandoffMessage = vi.hoisted(() => vi.fn())
const mockRecordDecision = vi.hoisted(() => vi.fn())
const mockPostDecisionMessage = vi.hoisted(() => vi.fn())
const mockMarkDecisionDispatched = vi.hoisted(() => vi.fn())
const mockPostDecisionSummary = vi.hoisted(() => vi.fn())
const mockCommitDiscussionDoc = vi.hoisted(() => vi.fn())
const mockUndoDecision = vi.hoisted(() => vi.fn())
const mockReadGithubFile = vi.hoisted(() => vi.fn())

// ── Module mocks (hoisted before imports) ────────────────────────────────────
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockMessagesCreate }
  },
}))

vi.mock('@/lib/feature-stages', () => ({
  advanceStage: mockAdvanceStage,
  checkGate: vi.fn(),
}))

// Mock dispatch so fire-and-forget doesn't consume DB mocks used by the main flow
vi.mock('@/lib/feature-stages/dispatch', () => ({
  getDispatchTargets: mockGetDispatchTargets,
  postHandoffMessage: mockPostHandoffMessage,
  handoffMessage: vi.fn().mockReturnValue('🔔 Test handoff'),
  STAGE_DISPATCH: {},
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({}),
  createServiceClient: vi.fn().mockReturnValue({
    from: mockServiceFrom,
    rpc: mockRpc,
  }),
}))

vi.mock('@/lib/decisions/record', () => ({
  recordDecision: mockRecordDecision,
}))

vi.mock('@/lib/decisions/dispatch', () => ({
  postDecisionMessage: mockPostDecisionMessage,
  postDecisionSummary: mockPostDecisionSummary,
  markDecisionDispatched: mockMarkDecisionDispatched,
}))

vi.mock('@/lib/decisions/github-commit', () => ({
  commitDiscussionDoc: mockCommitDiscussionDoc,
}))

vi.mock('@/lib/decisions/undo', () => ({
  undoDecision: mockUndoDecision,
}))

vi.mock('@/lib/github/reader', () => ({
  readGithubFile: mockReadGithubFile,
  FileNotFoundError: class FileNotFoundError extends Error {
    constructor(path: string) { super(`File not found: ${path}`); this.name = 'FileNotFoundError' }
  },
  FileAccessDeniedError: class FileAccessDeniedError extends Error {
    constructor(path: string) { super(`Access denied: ${path}`); this.name = 'FileAccessDeniedError' }
  },
  NoGithubInstallationError: class NoGithubInstallationError extends Error {
    constructor() { super('No GitHub installation linked to this workspace'); this.name = 'NoGithubInstallationError' }
  },
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
  role_key: 'backend',
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
 * Standard bot-resolution mocks for `resolveBotForMessage` + workspace name lookup:
 *   1. channel_members: .select().eq().order() → [{ bot_role_id, is_primary }]
 *   2. bot_roles:       .select().in()         → [BOT_ROLE]
 *   3. workspaces:      .select().eq().single() → { name: 'Test Workspace' }
 *      (needed because respondToMessage now fetches workspace name to generate
 *       system prompt fresh from roles.ts instead of using the stale DB value)
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
  // workspaces chain — name used to generate system prompt from roles.ts
  mockServiceFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { name: 'Test Workspace' }, error: null }),
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
    mockServiceFrom.mockReset() // flush any unconsumed mockReturnValueOnce entries
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

  it('falls back to plain text when propose_github_action has empty actions array', async () => {
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-fallback'))

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
    const result = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)
    expect(result).toBe('msg-fallback')
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

// ── advance_feature_stage tool handler ───────────────────────────────────────
describe('respondToMessage — advance_feature_stage tool_use', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset() // flush any unconsumed mockReturnValueOnce entries
    // Default: dispatch finds no targets (fire-and-forget is a no-op)
    mockGetDispatchTargets.mockResolvedValue([])
    mockPostHandoffMessage.mockResolvedValue('handoff-msg-id')
  })

  function advanceToolResponse(overrides: Record<string, unknown> = {}) {
    return {
      content: [
        {
          type: 'tool_use',
          id: 'tool-advance',
          name: 'advance_feature_stage',
          input: {
            feature_id: 'feat-123',
            to_stage: 2,
            gate_type: 'bot_signoff',
            notes: 'Use cases are ready',
            ...overrides,
          },
        },
      ],
      stop_reason: 'tool_use',
    }
  }

  /** Mock for feature title fetch (new in Phase 16B dispatch wiring) */
  function mockFeatureTitleFetch(title = 'Test Feature') {
    mockServiceFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { title }, error: null }),
    })
  }

  it('calls advanceStage and inserts success system message', async () => {
    setupBotResolutionMocks()
    mockAdvanceStage.mockResolvedValue(undefined)

    // feature title fetch (new: for dispatch handoff)
    mockFeatureTitleFetch('Dark Mode')

    // system message insert
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-msg-1' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: insertMock })

    mockMessagesCreate.mockResolvedValue(advanceToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID, undefined, 'advance please')

    expect(id).toBe('sys-msg-1')
    expect(mockAdvanceStage).toHaveBeenCalledWith('feat-123', 2, 'bot_signoff', BOT_ROLE.role_key, 'Use cases are ready')

    const insertedPayload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertedPayload.author_type).toBe('system')
    expect(insertedPayload.content as string).toMatch(/✓ Feature advanced to stage 2/)
  })

  it('inserts gate-blocked system message when advanceStage throws', async () => {
    setupBotResolutionMocks()
    mockAdvanceStage.mockRejectedValue(new Error('No use cases defined yet'))

    // feature title fetch (happens before advanceStage call, even when it throws)
    mockFeatureTitleFetch()

    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-msg-2' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: insertMock })

    mockMessagesCreate.mockResolvedValue(advanceToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('sys-msg-2')
    const insertedPayload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertedPayload.content as string).toBe('Gate blocked: No use cases defined yet')
  })

  it('throws when system message insert fails after advance_feature_stage', async () => {
    setupBotResolutionMocks()
    mockAdvanceStage.mockResolvedValue(undefined)

    // feature title fetch
    mockFeatureTitleFetch()

    // insert fails
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert error' } }),
      }),
    })

    mockMessagesCreate.mockResolvedValue(advanceToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('Failed to store system message')
  })

  it('dispatch fires sequential callback when advance succeeds with non-empty targets', async () => {
    setupBotResolutionMocks()
    mockAdvanceStage.mockResolvedValue(undefined)
    mockFeatureTitleFetch('Dark Mode')
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('sys-dispatch-seq'))

    // Return a sequential target so dispatch enters the non-empty branch
    mockGetDispatchTargets.mockResolvedValueOnce([{ channelId: 'target-ch', parallel: false }])

    mockMessagesCreate.mockResolvedValue(advanceToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)
    expect(id).toBe('sys-dispatch-seq')

    // Flush microtasks so the fire-and-forget .then() completes
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockGetDispatchTargets).toHaveBeenCalledWith(WORKSPACE_ID, 2)
    // postHandoffMessage called for the target channel
    expect(mockPostHandoffMessage).toHaveBeenCalledWith('target-ch', 'Dark Mode', 2)
  })

  it('dispatch fires parallel callback for parallel targets', async () => {
    setupBotResolutionMocks()
    mockAdvanceStage.mockResolvedValue(undefined)
    mockFeatureTitleFetch('Dark Mode')
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('sys-dispatch-par'))

    // Return two parallel targets
    mockGetDispatchTargets.mockResolvedValueOnce([
      { channelId: 'target-ch-a', parallel: true },
      { channelId: 'target-ch-b', parallel: true },
    ])

    mockMessagesCreate.mockResolvedValue(advanceToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)
    expect(id).toBe('sys-dispatch-par')

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockPostHandoffMessage).toHaveBeenCalledWith('target-ch-a', 'Dark Mode', 2)
    expect(mockPostHandoffMessage).toHaveBeenCalledWith('target-ch-b', 'Dark Mode', 2)
  })

  it('dispatch .catch() handles getDispatchTargets rejection gracefully', async () => {
    setupBotResolutionMocks()
    mockAdvanceStage.mockResolvedValue(undefined)
    mockFeatureTitleFetch()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('sys-dispatch-catch'))

    mockGetDispatchTargets.mockRejectedValueOnce(new Error('DB down'))

    mockMessagesCreate.mockResolvedValue(advanceToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    // Should not throw — .catch() handles the rejection
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)
    expect(id).toBe('sys-dispatch-catch')
  })
})

// ── create_feature tool handler ───────────────────────────────────────────────
describe('respondToMessage — create_feature tool_use', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset() // flush any unconsumed mockReturnValueOnce entries
    mockGetDispatchTargets.mockResolvedValue([])
    mockPostHandoffMessage.mockResolvedValue('handoff-msg-id')
  })

  function createFeatureToolResponse(overrides: Record<string, unknown> = {}) {
    return {
      content: [
        {
          type: 'tool_use',
          id: 'tool-create',
          name: 'create_feature',
          input: {
            title: 'Dark Mode',
            description: 'Allow users to switch to dark colour scheme.',
            complexity: 'small',
            ...overrides,
          },
        },
      ],
      stop_reason: 'tool_use',
    }
  }

  function featureInsertChain(featureId: string) {
    return {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: featureId }, error: null }),
      }),
    }
  }

  it('inserts feature row and returns system message id on success', async () => {
    setupBotResolutionMocks()

    const featureMock = featureInsertChain('feat-new-id')
    mockServiceFrom.mockReturnValueOnce(featureMock)
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('sys-create-ok'))

    mockMessagesCreate.mockResolvedValue(createFeatureToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('sys-create-ok')
    // Feature was inserted with correct workspace and stage
    expect(featureMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WORKSPACE_ID,
        title: 'Dark Mode',
        stage: 1,
        status: 'active',
      })
    )
  })

  it('system message content includes feature title and ID on success', async () => {
    setupBotResolutionMocks()

    mockServiceFrom.mockReturnValueOnce(featureInsertChain('feat-abc'))
    const msgInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-title-check' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: msgInsert })

    mockMessagesCreate.mockResolvedValue(createFeatureToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    const content = (msgInsert.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(content).toContain('Dark Mode')
    expect(content).toContain('feat-abc')
    expect(content).toContain('Stage 1')
  })

  it('stores failure message when feature insert returns an error', async () => {
    setupBotResolutionMocks()

    // Feature insert fails
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB constraint' } }),
      }),
    })
    const msgInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-fail' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: msgInsert })

    mockMessagesCreate.mockResolvedValue(createFeatureToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('sys-fail')
    const content = (msgInsert.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(content).toContain('Failed to create feature')
    expect(content).toContain('DB constraint')
  })

  it('throws when system message insert fails after create_feature', async () => {
    setupBotResolutionMocks()

    mockServiceFrom.mockReturnValueOnce(featureInsertChain('feat-xyz'))
    mockServiceFrom.mockReturnValueOnce(failingInsertChain('insert failed'))

    mockMessagesCreate.mockResolvedValue(createFeatureToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('Failed to store system message')
  })
})

// ── record_decision tool handler ──────────────────────────────────────────────
describe('respondToMessage — record_decision tool_use', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset() // flush any unconsumed mockReturnValueOnce entries
    mockPostDecisionMessage.mockResolvedValue(null)
    mockPostDecisionSummary.mockResolvedValue(undefined)
    mockMarkDecisionDispatched.mockResolvedValue(undefined)
  })

  function recordDecisionToolResponse(input: { title: string; summary: string; action?: string }) {
    return {
      content: [
        {
          type: 'tool_use',
          id: 'tool-record-decision',
          name: 'record_decision',
          input,
        },
      ],
      stop_reason: 'tool_use',
    }
  }

  const MOCK_DECISION = {
    id: 'decision-uuid',
    workspace_id: WORKSPACE_ID,
    channel_id: CHANNEL_ID,
    bot_role_id: BOT_ROLE.id,
    title: 'Use PostgreSQL',
    summary: 'We will use PostgreSQL for the primary database.',
    action: null,
    action_dispatched_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }

  it('happy path without action — recordDecision called, confirmation message inserted', async () => {
    setupBotResolutionMocks()
    mockRecordDecision.mockResolvedValue({ ...MOCK_DECISION })

    const msgInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-decision-ok' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: msgInsert })

    mockMessagesCreate.mockResolvedValue(
      recordDecisionToolResponse({ title: 'Use PostgreSQL', summary: 'Primary DB choice.' })
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('sys-decision-ok')
    expect(mockRecordDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        channelId: CHANNEL_ID,
        title: 'Use PostgreSQL',
        summary: 'Primary DB choice.',
      })
    )
    const content = (msgInsert.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(content).toContain('Decision recorded:')
    expect(content).toContain('Use PostgreSQL')
    // No dispatch suffix when no action
    expect(content).not.toContain('#decisions')
    expect(mockPostDecisionMessage).not.toHaveBeenCalled()
  })

  it('happy path with action — confirmation includes dispatch notice', async () => {
    setupBotResolutionMocks()
    mockRecordDecision.mockResolvedValue({ ...MOCK_DECISION, id: 'decision-with-action' })
    // postDecisionMessage returns null → dispatch branch still appends suffix
    mockPostDecisionMessage.mockResolvedValue(null)

    const msgInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-decision-action' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: msgInsert })

    mockMessagesCreate.mockResolvedValue(
      recordDecisionToolResponse({
        title: 'Use PostgreSQL',
        summary: 'Primary DB choice.',
        action: 'Set up PostgreSQL on production.',
      })
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('sys-decision-action')
    const content = (msgInsert.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(content).toContain('Decision recorded:')
    expect(content).toContain('Your team has been asked to act on this in #decisions.')
    expect(mockPostDecisionMessage).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'Set up PostgreSQL on production.',
      BOT_ROLE.id
    )
  })

  it('DB error path — recordDecision throws, fallback error message inserted', async () => {
    setupBotResolutionMocks()
    mockRecordDecision.mockRejectedValue(new Error('insert constraint violation'))

    const msgInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-decision-err' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: msgInsert })

    mockMessagesCreate.mockResolvedValue(
      recordDecisionToolResponse({ title: 'Use PostgreSQL', summary: 'Primary DB choice.' })
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('sys-decision-err')
    const content = (msgInsert.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(content).toContain('Failed to record decision:')
    expect(content).toContain('insert constraint violation')
  })

  it('throws when system message insert fails after record_decision', async () => {
    setupBotResolutionMocks()
    mockRecordDecision.mockResolvedValue({ ...MOCK_DECISION })

    mockServiceFrom.mockReturnValueOnce(failingInsertChain('db down'))

    mockMessagesCreate.mockResolvedValue(
      recordDecisionToolResponse({ title: 'Use PostgreSQL', summary: 'Primary DB choice.' })
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('Failed to store system message')
  })

  it('with action — fires dispatch when postDecisionMessage returns a channel id', async () => {
    setupBotResolutionMocks()
    mockRecordDecision.mockResolvedValue({ ...MOCK_DECISION, id: 'decision-dispatched' })
    // postDecisionMessage returns a valid result → the .then() branch enters the try block
    mockPostDecisionMessage.mockResolvedValue({
      decisionsChannelId: 'decisions-ch-id',
      messageId: 'decisions-msg-id',
    })
    mockMarkDecisionDispatched.mockResolvedValue(undefined)

    const msgInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-dispatch-ok' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: msgInsert })

    // The fire-and-forget calls respondToMessage on decisionsChannelId — we need
    // bot resolution + message insert mocks for that nested call too.
    // Set them up so the recursive call can complete cleanly.
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('decisions-reply-id'))
    mockMessagesCreate
      .mockResolvedValueOnce(
        recordDecisionToolResponse({
          title: 'Use PostgreSQL',
          summary: 'Primary DB choice.',
          action: 'Set up PostgreSQL on production.',
        })
      )
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'On it!' }],
        stop_reason: 'end_turn',
      })

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)
    expect(id).toBe('sys-dispatch-ok')

    // Flush microtasks so the fire-and-forget .then() completes
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockMarkDecisionDispatched).toHaveBeenCalledWith('decision-dispatched')
  })

  it('with action — .catch() handles postDecisionMessage rejection gracefully', async () => {
    setupBotResolutionMocks()
    mockRecordDecision.mockResolvedValue({ ...MOCK_DECISION })
    mockPostDecisionMessage.mockRejectedValue(new Error('channel lookup failed'))

    const msgInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-catch-ok' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: msgInsert })

    mockMessagesCreate.mockResolvedValue(
      recordDecisionToolResponse({
        title: 'Use PostgreSQL',
        summary: 'Primary DB choice.',
        action: 'Set up PostgreSQL.',
      })
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    // Should not throw — .catch() handles the rejection
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)
    expect(id).toBe('sys-catch-ok')

    // Flush microtasks
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})

// ── document_discussion tool handler ─────────────────────────────────────────
describe('respondToMessage — document_discussion tool_use', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset() // flush any unconsumed mockReturnValueOnce entries
  })

  function documentDiscussionToolResponse(input: { title: string; summary: string }) {
    return {
      content: [
        {
          type: 'tool_use',
          id: 'tool-document-discussion',
          name: 'document_discussion',
          input,
        },
      ],
      stop_reason: 'tool_use',
    }
  }

  it('happy path with GitHub connected — confirmation includes view link', async () => {
    setupBotResolutionMocks()
    mockCommitDiscussionDoc.mockResolvedValue({
      committed: true,
      path: 'docs/discussions/2026-01-01-rate-limiting.md',
      url: 'https://github.com/owner/repo/blob/main/docs/discussions/2026-01-01-rate-limiting.md',
    })

    const msgInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-doc-ok' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: msgInsert })

    mockMessagesCreate.mockResolvedValue(
      documentDiscussionToolResponse({ title: 'Rate Limiting Strategy', summary: 'We discussed rate limiting approaches.' })
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('sys-doc-ok')
    expect(mockCommitDiscussionDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        title: 'Rate Limiting Strategy',
        summary: 'We discussed rate limiting approaches.',
      })
    )
    const content = (msgInsert.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(content).toContain('✓ Discussion saved')
    expect(content).toContain('[View the document]')
    expect(content).toContain('https://github.com')
  })

  it('no GitHub path — commitDiscussionDoc returns committed:false, fallback message', async () => {
    setupBotResolutionMocks()
    mockCommitDiscussionDoc.mockResolvedValue({ committed: false })

    const msgInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-doc-no-gh' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: msgInsert })

    mockMessagesCreate.mockResolvedValue(
      documentDiscussionToolResponse({ title: 'Auth Discussion', summary: 'Summary of the auth discussion.' })
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('sys-doc-no-gh')
    const content = (msgInsert.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(content).toContain('no GitHub connected')
    expect(content).toContain('Auth Discussion')
  })

  it('commitDiscussionDoc throws — fallback error message inserted', async () => {
    setupBotResolutionMocks()
    mockCommitDiscussionDoc.mockRejectedValue(new Error('Octokit rate limit'))

    const msgInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-doc-err' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: msgInsert })

    mockMessagesCreate.mockResolvedValue(
      documentDiscussionToolResponse({ title: 'Auth Discussion', summary: 'Summary.' })
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('sys-doc-err')
    const content = (msgInsert.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(content).toContain('Failed to document discussion:')
    expect(content).toContain('Octokit rate limit')
  })

  it('throws when system message insert fails after document_discussion', async () => {
    setupBotResolutionMocks()
    mockCommitDiscussionDoc.mockResolvedValue({ committed: false })

    mockServiceFrom.mockReturnValueOnce(failingInsertChain('db error'))

    mockMessagesCreate.mockResolvedValue(
      documentDiscussionToolResponse({ title: 'Auth Discussion', summary: 'Summary.' })
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('Failed to store system message')
  })
})

// ── undo_decision tool handler ────────────────────────────────────────────────
describe('respondToMessage — undo_decision tool_use', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset() // flush any unconsumed mockReturnValueOnce entries
  })

  function undoDecisionToolResponse() {
    return {
      content: [
        {
          type: 'tool_use',
          id: 'tool-undo-decision',
          name: 'undo_decision',
          input: {},
        },
      ],
      stop_reason: 'tool_use',
    }
  }

  it('UC-19-13: clean undo — system message contains "quietly removed"', async () => {
    setupBotResolutionMocks()
    mockUndoDecision.mockResolvedValue({
      undone: true,
      title: 'Use PostgreSQL',
      actionWasDispatched: false,
    })

    const msgInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-undo-clean' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: msgInsert })

    mockMessagesCreate.mockResolvedValue(undoDecisionToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('sys-undo-clean')
    expect(mockUndoDecision).toHaveBeenCalledWith(WORKSPACE_ID, CHANNEL_ID, BOT_ROLE.id)

    const content = (msgInsert.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(content).toContain('quietly removed')
  })

  it('UC-19-14: dispatched undo — system message contains "team already saw this"', async () => {
    setupBotResolutionMocks()
    mockUndoDecision.mockResolvedValue({
      undone: true,
      title: 'Use PostgreSQL',
      actionWasDispatched: true,
    })

    const msgInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-undo-dispatched' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: msgInsert })

    mockMessagesCreate.mockResolvedValue(undoDecisionToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('sys-undo-dispatched')
    const content = (msgInsert.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(content).toContain('team already saw this')
  })

  it('UC-19-15: nothing to undo — system message contains "don\'t see a recent decision"', async () => {
    setupBotResolutionMocks()
    mockUndoDecision.mockResolvedValue({ undone: false })

    const msgInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-undo-nothing' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: msgInsert })

    mockMessagesCreate.mockResolvedValue(undoDecisionToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('sys-undo-nothing')
    const content = (msgInsert.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(content).toContain("don't see a recent decision")
  })

  it('DB error: undoDecision throws — fallback error message contains "Failed to undo decision"', async () => {
    setupBotResolutionMocks()
    mockUndoDecision.mockRejectedValue(new Error('connection timeout'))

    const msgInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sys-undo-err' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: msgInsert })

    mockMessagesCreate.mockResolvedValue(undoDecisionToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('sys-undo-err')
    const content = (msgInsert.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(content).toContain('Failed to undo decision')
    expect(content).toContain('connection timeout')
  })

  it('insert fails — throws "Failed to store system message"', async () => {
    setupBotResolutionMocks()
    mockUndoDecision.mockResolvedValue({ undone: false })

    mockServiceFrom.mockReturnValueOnce(failingInsertChain('db write failed'))

    mockMessagesCreate.mockResolvedValue(undoDecisionToolResponse())

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('Failed to store system message')
  })
})

// ── read_github_file tool handler (Phase 20) ─────────────────────────────────
describe('respondToMessage — read_github_file tool_use', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
    mockReadGithubFile.mockReset()
  })

  function readFileToolResponse(path: string, branch?: string, toolId = 'tool-read-1') {
    return {
      content: [
        {
          type: 'tool_use',
          id: toolId,
          name: 'read_github_file',
          input: branch ? { path, branch } : { path },
        },
      ],
      stop_reason: 'tool_use',
    }
  }

  function textResponse(text = 'Here is what I found in the file.') {
    return {
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    }
  }

  it('single read — file content injected as tool_result, second Claude call stores bot message', async () => {
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-after-read'))

    mockReadGithubFile.mockResolvedValueOnce({
      content: 'import fastapi\nclass Collector: pass',
      sha: 'abc123',
      truncated: false,
    })

    mockMessagesCreate
      .mockResolvedValueOnce(readFileToolResponse('src/m1/collector.py'))
      .mockResolvedValueOnce(textResponse('M1 uses FastAPI. I will build M2 on top of that.'))

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('msg-after-read')
    expect(mockReadGithubFile).toHaveBeenCalledWith(WORKSPACE_ID, 'src/m1/collector.py', undefined)
    // Claude called twice: once for the read, once for the final reply
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2)

    // The second call should include the tool_result message in messages array
    const secondCallMessages = mockMessagesCreate.mock.calls[1][0].messages as unknown[]
    const toolResultMsg = secondCallMessages.find(
      (m) => (m as { role: string }).role === 'user' &&
        Array.isArray((m as { content: unknown[] }).content) &&
        ((m as { content: Array<{ type: string }> }).content)[0]?.type === 'tool_result'
    )
    expect(toolResultMsg).toBeDefined()
  })

  it('two reads — both tool_results injected before final Claude response is stored', async () => {
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-after-two-reads'))

    mockReadGithubFile
      .mockResolvedValueOnce({ content: '# Module 1', sha: 'sha1', truncated: false })
      .mockResolvedValueOnce({ content: '# Module 2 stub', sha: 'sha2', truncated: false })

    mockMessagesCreate
      .mockResolvedValueOnce(readFileToolResponse('src/m1/index.py', undefined, 'tool-read-a'))
      .mockResolvedValueOnce(readFileToolResponse('src/m2/index.py', undefined, 'tool-read-b'))
      .mockResolvedValueOnce(textResponse('I have read both files.'))

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('msg-after-two-reads')
    expect(mockReadGithubFile).toHaveBeenCalledTimes(2)
    expect(mockMessagesCreate).toHaveBeenCalledTimes(3)
  })

  it('file not found — tool_result contains "File not found:" and Claude still gets called', async () => {
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-file-not-found'))

    const { FileNotFoundError } = await import('@/lib/github/reader')
    mockReadGithubFile.mockRejectedValueOnce(new FileNotFoundError('missing.py'))

    mockMessagesCreate
      .mockResolvedValueOnce(readFileToolResponse('missing.py'))
      .mockResolvedValueOnce(textResponse("That file doesn't exist yet."))

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('msg-file-not-found')
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2)

    // The tool_result injected into the second call should contain the error message
    const secondCallMessages = mockMessagesCreate.mock.calls[1][0].messages as unknown[]
    const toolResultMsg = secondCallMessages.find(
      (m) =>
        (m as { role: string }).role === 'user' &&
        Array.isArray((m as { content: unknown[] }).content) &&
        ((m as { content: Array<{ content?: string }> }).content)[0]?.content?.includes('File not found:')
    )
    expect(toolResultMsg).toBeDefined()
  })

  it('parallel reads — Claude returns multiple read_github_file in one response, all resolved before next call', async () => {
    // This is the exact scenario that caused the 400 "tool_use ids without tool_result" error.
    // Claude can call several read_github_file tools in parallel (one response, multiple tool_use blocks).
    // The loop must provide a tool_result for EVERY tool_use block, not just the first.
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-parallel-reads'))

    mockReadGithubFile
      .mockResolvedValueOnce({ content: '// auth.tsx', sha: 'sha-a', truncated: false })
      .mockResolvedValueOnce({ content: '// pages/auth.tsx', sha: 'sha-b', truncated: false })

    mockMessagesCreate
      // First call: Claude returns TWO read_github_file tool_uses in one response
      .mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'tool-parallel-a', name: 'read_github_file', input: { path: 'app/auth.tsx' } },
          { type: 'tool_use', id: 'tool-parallel-b', name: 'read_github_file', input: { path: 'pages/auth.tsx' } },
        ],
        stop_reason: 'tool_use',
      })
      // Second call: Claude responds with text after seeing both file contents
      .mockResolvedValueOnce(textResponse('Neither path exists in your repo.'))

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('msg-parallel-reads')
    expect(mockReadGithubFile).toHaveBeenCalledTimes(2)
    // Only 2 Claude calls (not 3) because both reads were resolved in one iteration
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2)

    // The second call must contain tool_result blocks for BOTH tool_use ids
    const secondCallMessages = mockMessagesCreate.mock.calls[1][0].messages as unknown[]
    const toolResultMsg = secondCallMessages.find(
      (m) =>
        (m as { role: string }).role === 'user' &&
        Array.isArray((m as { content: unknown[] }).content) &&
        (m as { content: unknown[] }).content.length === 2 // two results
    )
    expect(toolResultMsg).toBeDefined()
  })

  it('after read loop exits on non-read tool_use, existing propose_github_action handler runs', async () => {
    setupBotResolutionMocks()

    // plans insert
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'plan-after-read' }, error: null }),
      }),
    })
    // messages insert
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-propose-after-read'))

    mockReadGithubFile.mockResolvedValueOnce({ content: 'existing code', sha: 'sha1', truncated: false })

    mockMessagesCreate
      .mockResolvedValueOnce(readFileToolResponse('src/app.ts'))
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'tool-propose',
            name: 'propose_github_action',
            input: {
              plain_english_description: 'Update src/app.ts with new feature',
              actions: [{ action_type: 'commit_file', payload: { file_path: 'src/app.ts', content: 'new code', commit_message: 'Add feature', branch: 'bot/feature' } }],
            },
          },
        ],
        stop_reason: 'tool_use',
      })

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('msg-propose-after-read')
    expect(mockReadGithubFile).toHaveBeenCalledOnce()
    // Claude called twice: once for read, once returning propose_github_action
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2)
  })

  it('loop caps at MAX_READ_ITERATIONS (5) without infinite loop — breaks and stores final text response', async () => {
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-cap'))

    // readGithubFile always succeeds
    mockReadGithubFile.mockResolvedValue({ content: 'some content', sha: 'sha', truncated: false })

    // Claude returns read_github_file 5 times, then returns text on 6th call
    for (let i = 0; i < 5; i++) {
      mockMessagesCreate.mockResolvedValueOnce(readFileToolResponse(`src/file${i}.py`, undefined, `tool-${i}`))
    }
    // 6th call (after loop exits at MAX_READ_ITERATIONS) — this is the call made on the last iteration
    // Actually the loop runs up to 5 iterations; on the 5th the loop increments to 5 and exits.
    // The 6th mockMessagesCreate should be the final stored text.
    mockMessagesCreate.mockResolvedValueOnce(textResponse('I read 5 files.'))

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('msg-cap')
    // readGithubFile called at most 5 times (cap)
    expect(mockReadGithubFile).toHaveBeenCalledTimes(5)
    // Total Claude calls: 6 (1 initial + 5 in loop, last one returns text which exits loop)
    expect(mockMessagesCreate).toHaveBeenCalledTimes(6)
  })
})
