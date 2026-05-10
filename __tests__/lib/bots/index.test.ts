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

// Returns a fluent Supabase chain that resolves to `result` at `.single()`
function chain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {}
  obj.select = vi.fn().mockReturnValue(obj)
  obj.eq = vi.fn().mockReturnValue(obj)
  obj.order = vi.fn().mockReturnValue(obj)
  obj.limit = vi.fn().mockReturnValue(obj)
  obj.single = vi.fn().mockResolvedValue(result)
  obj.insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue(result) }) })
  obj.update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue(result) })
  return obj
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('respondToMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores a plain-text reply and returns message id', async () => {
    mockServiceFrom
      .mockReturnValueOnce(chain({ data: { bot_role_id: BOT_ROLE.id }, error: null })) // channels
      .mockReturnValueOnce(chain({ data: BOT_ROLE, error: null }))                      // bot_roles
      .mockReturnValueOnce(chain({ data: { id: 'msg-uuid' }, error: null }))           // messages insert

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
    mockServiceFrom
      .mockReturnValueOnce(chain({ data: { bot_role_id: BOT_ROLE.id }, error: null }))
      .mockReturnValueOnce(chain({ data: BOT_ROLE, error: null }))
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'msg-uuid' }, error: null }),
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
    mockServiceFrom.mockImplementation((table: string) => {
      const result =
        table === 'channels' ? { data: { bot_role_id: BOT_ROLE.id }, error: null }
        : table === 'bot_roles' ? { data: BOT_ROLE, error: null }
        : { data: { id: table === 'plans' ? 'plan-uuid' : 'msg-uuid' }, error: null }

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(result),
        insert: vi.fn().mockImplementation(() => {
          tablesWritten.push(table)
          return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: table === 'plans' ? 'plan-uuid' : 'msg-uuid' }, error: null }) }
        }),
      }
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
    mockServiceFrom.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(
        table === 'channels' ? { data: { bot_role_id: BOT_ROLE.id }, error: null }
        : table === 'bot_roles' ? { data: BOT_ROLE, error: null }
        : { data: { id: table === 'plans' ? 'plan-uuid' : 'msg-uuid' }, error: null }
      ),
      insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        if (table === 'plans') storedPlanPayload = payload
        return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'plan-uuid' }, error: null }) }
      }),
    }))

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
    mockServiceFrom.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(
        table === 'channels' ? { data: { bot_role_id: BOT_ROLE.id }, error: null }
        : table === 'bot_roles' ? { data: BOT_ROLE, error: null }
        : { data: { id: table === 'plans' ? 'plan-uuid' : 'msg-uuid' }, error: null }
      ),
      insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        if (table === 'plans') storedPlanPayload = payload
        return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'plan-uuid' }, error: null }) }
      }),
    }))

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
    mockServiceFrom.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(
        table === 'channels' ? { data: { bot_role_id: BOT_ROLE.id }, error: null }
        : table === 'bot_roles' ? { data: BOT_ROLE, error: null }
        : { data: { id: table === 'plans' ? 'plan-uuid' : 'msg-uuid' }, error: null }
      ),
      insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        if (table === 'messages') insertedMsg = payload
        const returnId = table === 'plans' ? 'plan-uuid' : 'msg-uuid'
        return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: returnId }, error: null }) }
      }),
    }))

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
    mockServiceFrom
      .mockReturnValueOnce(chain({ data: { bot_role_id: BOT_ROLE.id }, error: null }))
      .mockReturnValueOnce(chain({ data: BOT_ROLE, error: null }))
      .mockReturnValueOnce(chain({ data: { id: 'msg-uuid' }, error: null }))
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello!' }],
      stop_reason: 'end_turn',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    await respondToMessage(CHANNEL_ID, WORKSPACE_ID)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('throws when no bot is configured for the channel', async () => {
    mockServiceFrom.mockReturnValueOnce(chain({ data: { bot_role_id: null }, error: null }))
    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('No bot configured')
  })

  it('throws "No messages to respond to" when buildMessageHistory returns empty array', async () => {
    const { buildMessageHistory } = await import('@/lib/bots/context')
    vi.mocked(buildMessageHistory).mockResolvedValueOnce([])

    mockServiceFrom
      .mockReturnValueOnce(chain({ data: { bot_role_id: BOT_ROLE.id }, error: null }))
      .mockReturnValueOnce(chain({ data: BOT_ROLE, error: null }))

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('No messages to respond to')
    expect(mockMessagesCreate).not.toHaveBeenCalled()
  })

  it('throws when tool is called with empty actions array', async () => {
    mockServiceFrom
      .mockReturnValueOnce(chain({ data: { bot_role_id: BOT_ROLE.id }, error: null }))
      .mockReturnValueOnce(chain({ data: BOT_ROLE, error: null }))

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
    mockServiceFrom.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(
        table === 'channels' ? { data: { bot_role_id: BOT_ROLE.id }, error: null }
        : table === 'bot_roles' ? { data: BOT_ROLE, error: null }
        : { data: null, error: null }
      ),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB insert failed' } }),
      }),
    }))

    mockMessagesCreate.mockResolvedValue(
      toolUseResponse('create_issue', { title: 'Bug', body: 'desc' }, 'Create a bug report')
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('Failed to create plan')
  })

  it('throws "Failed to store bot reply" when message insert fails after tool use', async () => {
    let insertCallCount = 0
    mockServiceFrom.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(
        table === 'channels' ? { data: { bot_role_id: BOT_ROLE.id }, error: null }
        : table === 'bot_roles' ? { data: BOT_ROLE, error: null }
        : { data: null, error: null }
      ),
      insert: vi.fn().mockImplementation(() => {
        insertCallCount++
        const data = insertCallCount === 1 ? { id: 'plan-uuid' } : null
        const error = insertCallCount === 2 ? { message: 'message insert failed' } : null
        return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data, error }) }
      }),
    }))

    mockMessagesCreate.mockResolvedValue(
      toolUseResponse('create_issue', { title: 'Bug', body: 'desc' }, 'Create a bug report')
    )

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('Failed to store bot reply')
  })

  it('throws "Failed to store bot reply" when plain text message insert fails', async () => {
    mockServiceFrom
      .mockReturnValueOnce(chain({ data: { bot_role_id: BOT_ROLE.id }, error: null }))
      .mockReturnValueOnce(chain({ data: BOT_ROLE, error: null }))
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
        }),
      })

    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello there!' }],
      stop_reason: 'end_turn',
    })

    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('Failed to store bot reply')
  })

  it('throws when Claude returns empty text', async () => {
    mockServiceFrom
      .mockReturnValueOnce(chain({ data: { bot_role_id: BOT_ROLE.id }, error: null }))
      .mockReturnValueOnce(chain({ data: BOT_ROLE, error: null }))
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '   ' }],
      stop_reason: 'end_turn',
    })
    const { respondToMessage } = await import('@/lib/bots/index')
    await expect(respondToMessage(CHANNEL_ID, WORKSPACE_ID)).rejects.toThrow('empty')
  })
})
