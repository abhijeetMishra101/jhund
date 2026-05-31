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
const mockListDirectory = vi.hoisted(() => vi.fn())
const mockExecutePlanActions = vi.hoisted(() => vi.fn())
const mockMessageTeammate = vi.hoisted(() => vi.fn())

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
  listDirectory: mockListDirectory,
  FileNotFoundError: class FileNotFoundError extends Error {
    constructor(path: string) { super(`File not found: ${path}`); this.name = 'FileNotFoundError' }
  },
  FileAccessDeniedError: class FileAccessDeniedError extends Error {
    constructor(path: string) { super(`Access denied: ${path}`); this.name = 'FileAccessDeniedError' }
  },
  DirectoryNotFoundError: class DirectoryNotFoundError extends Error {
    constructor(path: string) { super(`Directory not found: ${path}`); this.name = 'DirectoryNotFoundError' }
  },
  DirectoryAccessDeniedError: class DirectoryAccessDeniedError extends Error {
    constructor(path: string) { super(`Access denied: ${path}`); this.name = 'DirectoryAccessDeniedError' }
  },
  NoGithubInstallationError: class NoGithubInstallationError extends Error {
    constructor() { super('No GitHub installation linked to this workspace'); this.name = 'NoGithubInstallationError' }
  },
}))

vi.mock('@/lib/bots/bot-to-bot', () => ({
  messageTeammate: mockMessageTeammate,
}))

vi.mock('@/lib/github/executor', () => ({
  executePlanActions: mockExecutePlanActions,
  ActionCapExceededError: class ActionCapExceededError extends Error {
    constructor() { super('Action cap exceeded'); this.name = 'ActionCapExceededError' }
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
 *   3. workspaces:      .select().eq().single() → { name: 'Test Workspace', bot_context }
 *      (needed because respondToMessage now fetches workspace name + bot_context to generate
 *       system prompt fresh from roles.ts instead of using the stale DB value)
 */
function setupBotResolutionMocks(
  memberRows = [{ bot_role_id: BOT_ROLE.id, is_primary: true }],
  botContext: string | null = null
) {
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
  // workspaces chain — name + bot_context used to generate system prompt from roles.ts
  mockServiceFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { name: 'Test Workspace', bot_context: botContext }, error: null }),
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
    expect(mockPostHandoffMessage).toHaveBeenCalledWith('target-ch', 'Dark Mode', 2, 'Use cases are ready')
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

    expect(mockPostHandoffMessage).toHaveBeenCalledWith('target-ch-a', 'Dark Mode', 2, 'Use cases are ready')
    expect(mockPostHandoffMessage).toHaveBeenCalledWith('target-ch-b', 'Dark Mode', 2, 'Use cases are ready')
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

    // bot reply insert comes first (preserves conversation alternation)
    mockServiceFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({}) })

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

    // bot reply insert comes first
    mockServiceFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({}) })

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

    // bot reply insert comes first
    mockServiceFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({}) })

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

    // bot reply insert succeeds; system chip insert fails
    mockServiceFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({}) })
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

    // bot reply insert comes first
    mockServiceFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({}) })

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

    // bot reply insert comes first
    mockServiceFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({}) })

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

  it('loop caps at MAX_WORK_ITERATIONS (10) without infinite loop — breaks when Claude switches to text', async () => {
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-cap'))

    // readGithubFile always succeeds
    mockReadGithubFile.mockResolvedValue({ content: 'some content', sha: 'sha', truncated: false })

    // Claude returns read_github_file 5 times, then returns text (loop exits well within the cap)
    for (let i = 0; i < 5; i++) {
      mockMessagesCreate.mockResolvedValueOnce(readFileToolResponse(`src/file${i}.py`, undefined, `tool-${i}`))
    }
    mockMessagesCreate.mockResolvedValueOnce(textResponse('I read 5 files.'))

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('msg-cap')
    expect(mockReadGithubFile).toHaveBeenCalledTimes(5)
    // Total Claude calls: 6 (1 initial + 5 in loop, last one returns text which breaks loop)
    expect(mockMessagesCreate).toHaveBeenCalledTimes(6)
  })

  it('cap-hit guard: surfaces friendly message when Claude still wants to read after MAX_WORK_ITERATIONS', async () => {
    setupBotResolutionMocks()

    // cap-hit system message insert
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'cap-hit-msg' }, error: null }),
      }),
    })

    // readGithubFile always succeeds
    mockReadGithubFile.mockResolvedValue({ content: 'file content', sha: 'sha', truncated: false })

    // Claude ALWAYS returns read_github_file — 11 calls (1 initial + 10 loop iterations)
    mockMessagesCreate.mockResolvedValue(readFileToolResponse('src/file.py', undefined, 'tool-read'))

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('cap-hit-msg')
    // Claude called 11 times (1 initial + 10 loop iterations)
    expect(mockMessagesCreate).toHaveBeenCalledTimes(11)
    // readGithubFile called 10 times (once per loop iteration)
    expect(mockReadGithubFile).toHaveBeenCalledTimes(10)
  })
})

// ── list_directory tool handler (Phase 21) ───────────────────────────────────
describe('respondToMessage — list_directory tool_use in read loop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
    mockReadGithubFile.mockReset()
    mockListDirectory.mockReset()
  })

  function listDirToolResponse(path: string, branch?: string, toolId = 'tool-list-1') {
    return {
      content: [
        {
          type: 'tool_use',
          id: toolId,
          name: 'list_directory',
          input: branch ? { path, branch } : { path },
        },
      ],
      stop_reason: 'tool_use',
    }
  }

  function textResponse(text = 'Here is what I found.') {
    return {
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    }
  }

  it('list_directory in read loop: Claude returns list_directory tool_use → server resolves → Claude gets tool_result in next turn', async () => {
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-after-list'))

    mockListDirectory.mockResolvedValueOnce([
      { name: 'index.ts', path: 'lib/bots/index.ts', type: 'file' },
      { name: 'tools.ts', path: 'lib/bots/tools.ts', type: 'file' },
    ])

    mockMessagesCreate
      .mockResolvedValueOnce(listDirToolResponse('lib/bots'))
      .mockResolvedValueOnce(textResponse('I can see two files in lib/bots.'))

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('msg-after-list')
    expect(mockListDirectory).toHaveBeenCalledWith(WORKSPACE_ID, 'lib/bots', undefined)
    // Claude called twice: once for the list, once for the final reply
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2)

    // The second call should include the tool_result message in messages array
    const secondCallMessages = mockMessagesCreate.mock.calls[1][0].messages as unknown[]
    const toolResultMsg = secondCallMessages.find(
      (m) => (m as { role: string }).role === 'user' &&
        Array.isArray((m as { content: unknown[] }).content) &&
        ((m as { content: Array<{ type: string }> }).content)[0]?.type === 'tool_result'
    )
    expect(toolResultMsg).toBeDefined()

    // The tool_result should contain JSON of the directory listing
    const toolResultContent = (toolResultMsg as { content: Array<{ content: string }> }).content[0].content
    const parsed = JSON.parse(toolResultContent)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].name).toBe('index.ts')
    expect(parsed[0].type).toBe('file')
  })

  it('directory not found — tool_result contains "Directory not found:" and Claude still gets called', async () => {
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-dir-not-found'))

    const { DirectoryNotFoundError } = await import('@/lib/github/reader')
    mockListDirectory.mockRejectedValueOnce(new DirectoryNotFoundError('lib/nonexistent'))

    mockMessagesCreate
      .mockResolvedValueOnce(listDirToolResponse('lib/nonexistent'))
      .mockResolvedValueOnce(textResponse("That directory doesn't exist."))

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('msg-dir-not-found')
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2)

    // The tool_result should contain the error message
    const secondCallMessages = mockMessagesCreate.mock.calls[1][0].messages as unknown[]
    const toolResultMsg = secondCallMessages.find(
      (m) =>
        (m as { role: string }).role === 'user' &&
        Array.isArray((m as { content: unknown[] }).content) &&
        ((m as { content: Array<{ content?: string }> }).content)[0]?.content?.includes('Directory not found:')
    )
    expect(toolResultMsg).toBeDefined()
  })

  it('mixed list_directory + read_github_file in same response: both resolved in one Promise.all → both tool_results in one user turn', async () => {
    setupBotResolutionMocks()
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-mixed'))

    mockListDirectory.mockResolvedValueOnce([
      { name: 'index.ts', path: 'lib/bots/index.ts', type: 'file' },
    ])
    mockReadGithubFile.mockResolvedValueOnce({
      content: '// some file content',
      sha: 'sha1',
      truncated: false,
    })

    mockMessagesCreate
      // First call: Claude returns one list_directory and one read_github_file in the same response
      .mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'tool-list-a', name: 'list_directory', input: { path: 'lib/bots' } },
          { type: 'tool_use', id: 'tool-read-b', name: 'read_github_file', input: { path: 'lib/bots/index.ts' } },
        ],
        stop_reason: 'tool_use',
      })
      // Second call: Claude responds after seeing both results
      .mockResolvedValueOnce(textResponse('I listed the dir and read the file.'))

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('msg-mixed')
    expect(mockListDirectory).toHaveBeenCalledTimes(1)
    expect(mockReadGithubFile).toHaveBeenCalledTimes(1)
    // Only 2 Claude calls — both resolved in one loop iteration
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2)

    // The second call must have both tool_results in one user message
    const secondCallMessages = mockMessagesCreate.mock.calls[1][0].messages as unknown[]
    const toolResultMsg = secondCallMessages.find(
      (m) =>
        (m as { role: string }).role === 'user' &&
        Array.isArray((m as { content: unknown[] }).content) &&
        (m as { content: unknown[] }).content.length === 2 // two results
    )
    expect(toolResultMsg).toBeDefined()
  })
})

// ── propose_github_action auto-approve (Phase 21) ────────────────────────────
describe('respondToMessage — propose_github_action auto-approve fork', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
    mockExecutePlanActions.mockReset()
  })

  function autoApproveToolResponse(
    filePath: string,
    branch: string,
    description = 'Update docs',
    confidence: 'auto' | 'review' = 'auto'
  ) {
    return {
      content: [
        {
          type: 'tool_use',
          id: 'tool-propose-auto',
          name: 'propose_github_action',
          input: {
            plain_english_description: description,
            confidence,
            actions: [
              {
                action_type: 'commit_file',
                payload: {
                  file_path: filePath,
                  content: '# Updated',
                  commit_message: 'update doc',
                  branch,
                },
              },
            ],
          },
        },
      ],
      stop_reason: 'tool_use',
    }
  }

  it('auto-approve happy path: docs/ commit_file with confidence=auto creates plan + executes, then Claude confirms', async () => {
    setupBotResolutionMocks()
    mockExecutePlanActions.mockResolvedValueOnce(undefined)

    // plans insert
    const plansInsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'auto-plan-uuid' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: plansInsertMock })

    // system message: "⚡ Auto-executing: ..."
    const autoExecMsgMock = vi.fn().mockResolvedValue({ error: null })
    mockServiceFrom.mockReturnValueOnce({ insert: autoExecMsgMock })

    // plans update (set status=approved)
    mockServiceFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    // After exec result fed back, Claude returns a plain text confirmation
    // Final bot message insert (text handler)
    const doneMsgMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'done-msg-uuid' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: doneMsgMock })

    // Claude's first response: auto-approvable action
    // Claude's second response (after exec result): plain text confirmation
    mockMessagesCreate
      .mockResolvedValueOnce(autoApproveToolResponse('docs/api.md', 'bot/update-docs', 'Update API docs', 'auto'))
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Done — API docs committed to GitHub.' }], stop_reason: 'end_turn' })

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    // Returns the id of Claude's confirmation message
    expect(id).toBe('done-msg-uuid')

    // executePlanActions was called with the plan id and workspace id
    expect(mockExecutePlanActions).toHaveBeenCalledWith('auto-plan-uuid', WORKSPACE_ID)

    // Plans was inserted with auto_approved=true
    const planPayload = plansInsertMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(planPayload.auto_approved).toBe(true)
    expect(planPayload.status).toBe('pending')

    // ⚡ system message was posted with step number
    const autoExecContent = (autoExecMsgMock.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(autoExecContent).toContain('⚡ Step 1:')
    expect(autoExecContent).toContain('Update API docs')

    // Claude was called twice: initial + after exec result
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2)
  })

  it('auto-approve fallback: confidence=auto but action is create_pr → falls back to normal plan chip', async () => {
    setupBotResolutionMocks()

    // plans insert (normal path)
    const plansInsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'normal-plan-uuid' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: plansInsertMock })

    // messages insert (bot message with plan chip)
    const messagesInsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'normal-msg-uuid' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: messagesInsertMock })

    // Claude proposes a create_pr with confidence=auto (server should reject auto-approve)
    mockMessagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tool-propose-pr',
          name: 'propose_github_action',
          input: {
            plain_english_description: 'Open a PR to add the API docs',
            confidence: 'auto',
            actions: [
              {
                action_type: 'create_pr',
                payload: { title: 'Add API docs', body: 'PR body', head_branch: 'bot/docs', base_branch: 'main' },
              },
            ],
          },
        },
      ],
      stop_reason: 'tool_use',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    // Returns bot message id (normal plan chip path)
    expect(id).toBe('normal-msg-uuid')

    // executePlanActions should NOT have been called — fell back to plan chip
    expect(mockExecutePlanActions).not.toHaveBeenCalled()

    // Plans was inserted WITHOUT auto_approved (normal path)
    const planPayload = plansInsertMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(planPayload.auto_approved).toBeUndefined()

    // Bot message was linked to the plan via plan_id
    const msgPayload = messagesInsertMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(msgPayload.plan_id).toBe('normal-plan-uuid')
    expect(msgPayload.author_type).toBe('bot')
  })

  it('auto-approve fallback: confidence=auto but file is in src/ (not whitelisted) → normal plan chip', async () => {
    setupBotResolutionMocks()

    const plansInsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'normal-plan-src' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: plansInsertMock })
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('normal-msg-src'))

    mockMessagesCreate.mockResolvedValueOnce(
      autoApproveToolResponse('src/app/auth.ts', 'bot/fix-auth', 'Fix auth bug', 'auto')
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('normal-msg-src')
    expect(mockExecutePlanActions).not.toHaveBeenCalled()
  })

  it('confidence=review (default) always goes through normal plan chip regardless of file path', async () => {
    setupBotResolutionMocks()

    const plansInsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'review-plan' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: plansInsertMock })
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('review-msg'))

    // Even a docs/ commit_file with confidence=review should go through normal path
    mockMessagesCreate.mockResolvedValueOnce(
      autoApproveToolResponse('docs/api.md', 'bot/update-docs', 'Update API docs', 'review')
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('review-msg')
    expect(mockExecutePlanActions).not.toHaveBeenCalled()

    // Bot message was linked to the plan (normal path)
    const msgPayload = plansInsertMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(msgPayload.auto_approved).toBeUndefined()
  })

  it('auto-approve: throws "Failed to create plan" when plan insert fails (line 599)', async () => {
    setupBotResolutionMocks()

    const plansInsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: plansInsertMock })

    mockMessagesCreate.mockResolvedValueOnce(
      autoApproveToolResponse('docs/api.md', 'bot/update-docs', 'Update API docs', 'auto')
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('Failed to create plan')
  })

  it('auto-approve: throws "Failed to store bot reply" when final text insert fails', async () => {
    setupBotResolutionMocks()

    // Plan insert succeeds
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'auto-plan' }, error: null }),
      }),
    })
    // "⚡ Auto-executing" system message insert succeeds
    mockServiceFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) })
    // Plan update (status → approved) succeeds
    mockServiceFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    // executePlanActions succeeds
    mockExecutePlanActions.mockResolvedValueOnce(undefined)
    // Final text message insert FAILS (text handler after second Claude call)
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
      }),
    })

    // First Claude call: auto-approvable action
    // Second Claude call (after exec result): plain text that fails to store
    mockMessagesCreate
      .mockResolvedValueOnce(autoApproveToolResponse('docs/api.md', 'bot/update-docs', 'Update API docs', 'auto'))
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Done!' }], stop_reason: 'end_turn' })

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('Failed to store bot reply')
  })
})

// ── Phase 23: Workspace Context injection ───────────────────────────────────
describe('respondToMessage — workspace bot_context injection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
  })

  it('injects bot_context into the system prompt when set', async () => {
    const ctx = 'This is Jhund. Stack: Next.js 14 + Supabase.'
    setupBotResolutionMocks(undefined, ctx)
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-1'))

    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Got it.' }],
      stop_reason: 'end_turn',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    const callArgs = mockMessagesCreate.mock.calls[0]?.[0] as Record<string, unknown>
    const systemBlocks = callArgs.system as Array<{ text: string }>
    expect(systemBlocks[0].text).toContain('## Project Context')
    expect(systemBlocks[0].text).toContain(ctx)
  })

  it('does not inject Project Context section when bot_context is null', async () => {
    setupBotResolutionMocks(undefined, null)
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-2'))

    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Got it.' }],
      stop_reason: 'end_turn',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    const callArgs = mockMessagesCreate.mock.calls[0]?.[0] as Record<string, unknown>
    const systemBlocks = callArgs.system as Array<{ text: string }>
    expect(systemBlocks[0].text).not.toContain('## Project Context')
  })

  it('does not inject Project Context section when bot_context is empty string', async () => {
    setupBotResolutionMocks(undefined, '')
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-3'))

    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Got it.' }],
      stop_reason: 'end_turn',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    const callArgs = mockMessagesCreate.mock.calls[0]?.[0] as Record<string, unknown>
    const systemBlocks = callArgs.system as Array<{ text: string }>
    expect(systemBlocks[0].text).not.toContain('## Project Context')
  })

  it('appends context after role instructions (role prompt comes first)', async () => {
    const ctx = 'Repo: myorg/myrepo'
    setupBotResolutionMocks(undefined, ctx)
    mockServiceFrom.mockReturnValueOnce(messagesInsertChain('msg-4'))

    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'OK.' }],
      stop_reason: 'end_turn',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    const callArgs = mockMessagesCreate.mock.calls[0]?.[0] as Record<string, unknown>
    const systemBlocks = callArgs.system as Array<{ text: string }>
    const text = systemBlocks[0].text
    const contextIndex = text.indexOf('## Project Context')
    // Role prompt must appear before the injected context section
    expect(contextIndex).toBeGreaterThan(0)
    expect(text.indexOf('Test Workspace')).toBeLessThan(contextIndex)
  })
})

// ── Phase 24: Autonomous work loop ──────────────────────────────────────────
describe('respondToMessage — autonomous work loop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
  })

  function autoInlineResponse(description = 'Commit spec doc', branch = 'bot/feature', id = 'tool-auto-1') {
    return {
      content: [
        {
          type: 'tool_use',
          id,
          name: 'propose_github_action',
          input: {
            plain_english_description: description,
            confidence: 'auto',
            actions: [{ action_type: 'commit_file', payload: { file_path: 'docs/spec.md', content: '# Spec', commit_message: 'add spec', branch } }],
          },
        },
      ],
      stop_reason: 'tool_use',
    }
  }

  function planChipResponse(description = 'Open PR to main') {
    return {
      content: [
        {
          type: 'tool_use',
          id: 'tool-pr',
          name: 'propose_github_action',
          input: {
            plain_english_description: description,
            confidence: 'review',
            actions: [{ action_type: 'create_pr', payload: { title: 'My PR', head_branch: 'bot/feature', base_branch: 'main', body: 'description' } }],
          },
        },
      ],
      stop_reason: 'tool_use',
    }
  }

  function plansMockChain(planId = 'plan-loop-1') {
    return {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: planId }, error: null }),
      }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
  }

  function systemMsgChain() {
    return { insert: vi.fn().mockResolvedValue({ data: { id: 'sys-msg' }, error: null }) }
  }

  function completionMsgChain(id = 'done-msg') {
    return {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
      }),
    }
  }

  it('chains two auto-approved commits before stopping at plain text', async () => {
    setupBotResolutionMocks()
    mockExecutePlanActions.mockResolvedValue(undefined)

    // First response: auto-approvable commit_file
    mockMessagesCreate
      .mockResolvedValueOnce(autoInlineResponse('Commit spec', 'bot/feat', 'tool-1'))
      // Second response (after first exec result fed back): another auto-approvable commit
      .mockResolvedValueOnce(autoInlineResponse('Commit impl', 'bot/feat', 'tool-2'))
      // Third response: plain text — bot is done
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'All done! Two files committed.' }], stop_reason: 'end_turn' })

    // Plans chain for first inline action
    const step1SysMsgMock = vi.fn().mockResolvedValue({ data: { id: 'sys-step1' }, error: null })
    mockServiceFrom.mockReturnValueOnce(plansMockChain('plan-1'))
    mockServiceFrom.mockReturnValueOnce({ insert: step1SysMsgMock })    // ⚡ Step 1
    mockServiceFrom.mockReturnValueOnce({ update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() })

    // Plans chain for second inline action
    const step2SysMsgMock = vi.fn().mockResolvedValue({ data: { id: 'sys-step2' }, error: null })
    mockServiceFrom.mockReturnValueOnce(plansMockChain('plan-2'))
    mockServiceFrom.mockReturnValueOnce({ insert: step2SysMsgMock })    // ⚡ Step 2
    mockServiceFrom.mockReturnValueOnce({ update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() })

    // ✅ summary message insert (autoStep=2 > 1, posted before Claude's text)
    const summaryMsgMock = vi.fn().mockResolvedValue({ data: { id: 'summary-msg' }, error: null })
    mockServiceFrom.mockReturnValueOnce({ insert: summaryMsgMock })

    // Final bot message insert (Claude's text)
    mockServiceFrom.mockReturnValueOnce(completionMsgChain('final-msg'))

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('final-msg')
    // Claude was called 3 times: initial + after first exec + after second exec
    expect(mockMessagesCreate).toHaveBeenCalledTimes(3)
    // executePlanActions called twice (once per inline action)
    expect(mockExecutePlanActions).toHaveBeenCalledTimes(2)
    // ⚡ Step messages used numbering
    const step1Content = (step1SysMsgMock.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(step1Content).toContain('⚡ Step 1:')
    const step2Content = (step2SysMsgMock.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(step2Content).toContain('⚡ Step 2:')
    // ✅ summary message was posted with the correct step count
    const summaryContent = (summaryMsgMock.mock.calls[0]?.[0] as Record<string, unknown>).content as string
    expect(summaryContent).toBe('✅ 2 steps completed')
  })

  it('stops at create_pr and creates a plan chip (founder gate preserved)', async () => {
    setupBotResolutionMocks()
    mockExecutePlanActions.mockResolvedValue(undefined)

    // First response: auto-approvable commit
    mockMessagesCreate
      .mockResolvedValueOnce(autoInlineResponse('Commit spec', 'bot/feat', 'tool-1'))
      // Second response: create_pr — must NOT be auto-executed, must create plan chip
      .mockResolvedValueOnce(planChipResponse('Open PR to main'))

    // Plans chain for first inline action
    mockServiceFrom.mockReturnValueOnce(plansMockChain('plan-1'))
    mockServiceFrom.mockReturnValueOnce(systemMsgChain())
    mockServiceFrom.mockReturnValueOnce({ update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() })

    // Plan chip: plans insert + bot message insert
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'pr-plan' }, error: null }),
      }),
    })
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'pr-msg' }, error: null }),
      }),
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('pr-msg')
    // executePlanActions called ONCE (for the commit), NOT for create_pr
    expect(mockExecutePlanActions).toHaveBeenCalledTimes(1)
    // Claude called twice
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2)
  })

  it('handles inline exec failure gracefully — feeds error back to Claude', async () => {
    setupBotResolutionMocks()
    mockExecutePlanActions.mockRejectedValueOnce(new Error('Branch not found'))

    mockMessagesCreate
      .mockResolvedValueOnce(autoInlineResponse('Commit spec', 'bot/feat', 'tool-1'))
      // Claude receives the error and responds with a plain text message
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Sorry, I hit an error. Let me try a different approach.' }], stop_reason: 'end_turn' })

    mockServiceFrom.mockReturnValueOnce(plansMockChain('plan-err'))
    mockServiceFrom.mockReturnValueOnce(systemMsgChain())
    mockServiceFrom.mockReturnValueOnce({ update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() })
    mockServiceFrom.mockReturnValueOnce(completionMsgChain('err-reply'))

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('err-reply')
    // Claude was called twice (once initial, once after error result)
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2)
    // The error was fed back — verify the second Claude call included the error in messages
    const secondCall = mockMessagesCreate.mock.calls[1]?.[0] as Record<string, unknown>
    const msgs = secondCall.messages as Array<{ role: string; content: unknown }>
    // Find the user message that contains tool_result (not the original "open an issue please")
    const toolResultMsg = msgs.find(
      (m) => m.role === 'user' && Array.isArray(m.content) &&
        (m.content as Array<{ type: string }>).some((c) => c.type === 'tool_result')
    )
    expect(JSON.stringify(toolResultMsg)).toContain('Branch not found')
  })
})

// ── Phase 25: message_teammate tool ─────────────────────────────────────────
describe('respondToMessage — message_teammate tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
  })

  function messageTeammateToolResponse(role = 'design', message = 'What is the preferred layout?') {
    return {
      content: [
        {
          type: 'tool_use',
          id: 'tool-msg-1',
          name: 'message_teammate',
          input: { role, message },
        },
      ],
      stop_reason: 'tool_use',
    }
  }

  it('happy path: calls messageTeammate, injects reply as tool_result, re-invokes Claude, stores final reply', async () => {
    setupBotResolutionMocks()
    mockMessageTeammate.mockResolvedValue("Use a two-column layout with sidebar nav.")

    // First Claude call → message_teammate tool; second → plain text after tool_result
    mockMessagesCreate
      .mockResolvedValueOnce(messageTeammateToolResponse('design', 'What layout?'))
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Got it — two-column layout confirmed.' }],
        stop_reason: 'end_turn',
      })

    // Final bot message insert
    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'reply-msg-id' }, error: null }),
      }),
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('reply-msg-id')
    expect(mockMessageTeammate).toHaveBeenCalledWith(
      BOT_ROLE.id,
      BOT_ROLE.display_name,
      'design',
      'What layout?',
      WORKSPACE_ID
    )
    // Claude called twice: initial + after tool_result injected
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2)
    // Second call should have tool_result in messages
    const secondCall = mockMessagesCreate.mock.calls[1]?.[0] as Record<string, unknown>
    const msgs = secondCall.messages as Array<{ role: string; content: unknown }>
    const toolResultMsg = msgs.find(
      (m) => m.role === 'user' && Array.isArray(m.content) &&
        (m.content as Array<{ type: string }>).some((c) => c.type === 'tool_result')
    )
    expect(JSON.stringify(toolResultMsg)).toContain('two-column layout')
  })

  it('messageTeammate failure: injects error as tool_result and Claude continues gracefully', async () => {
    setupBotResolutionMocks()
    mockMessageTeammate.mockRejectedValue(new Error('No design channel found in this workspace'))

    mockMessagesCreate
      .mockResolvedValueOnce(messageTeammateToolResponse('design', 'What layout?'))
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: "I couldn't reach Design, I'll proceed with my best guess." }],
        stop_reason: 'end_turn',
      })

    mockServiceFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'fallback-msg' }, error: null }),
      }),
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('fallback-msg')
    // Error message injected as tool_result
    const secondCall = mockMessagesCreate.mock.calls[1]?.[0] as Record<string, unknown>
    const msgs = secondCall.messages as Array<{ role: string; content: unknown }>
    const toolResultMsg = msgs.find(
      (m) => m.role === 'user' && Array.isArray(m.content) &&
        (m.content as Array<{ type: string }>).some((c) => c.type === 'tool_result')
    )
    expect(JSON.stringify(toolResultMsg)).toContain('Could not reach that teammate')
  })
})

// ── Phase 25: escalate_to_founder tool ──────────────────────────────────────
describe('respondToMessage — escalate_to_founder tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServiceFrom.mockReset()
  })

  it('posts 💬 question message and returns its id', async () => {
    setupBotResolutionMocks()

    mockMessagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tool-esc-1',
          name: 'escalate_to_founder',
          input: {
            reason: 'I found two conflicting requirements in the spec.',
            question: 'Should the modal be blocking or non-blocking?',
          },
        },
      ],
      stop_reason: 'tool_use',
    })

    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'escalation-msg-id' }, error: null }),
    })
    mockServiceFrom.mockReturnValueOnce({ insert: insertMock })

    const { respondToMessage } = await import('@/lib/bots/index')
    const id = await respondToMessage(CHANNEL_ID, WORKSPACE_ID)

    expect(id).toBe('escalation-msg-id')

    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload.author_type).toBe('system')
    expect(payload.content).toContain('💬')
    expect(payload.content).toContain('Sam has a question for you')
    expect(payload.content).toContain('Should the modal be blocking or non-blocking?')
    expect(payload.content).toContain('I found two conflicting requirements')
    // Claude is NOT called a second time — bot stops and waits
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1)
  })
})
