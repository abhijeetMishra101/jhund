/**
 * @vitest-environment jsdom
 *
 * Integration tests for WorkspaceShell — the stateful orchestrator.
 *
 * Strategy:
 *   - Supabase Realtime  → mocked; callback captured so we can simulate pushes
 *   - fetch              → vi.fn() stubbed per-test
 *   - Timers (polling)   → vi.useFakeTimers() for the background-poll and
 *                          polling-fallback effects
 *   - scrollIntoView     → stub (jsdom doesn't implement it)
 *
 * These tests cover the lines that pure component tests cannot:
 *   sendMessage (optimistic insert, 402, non-ok, replace id), channel switching,
 *   Realtime message push, background poll, polling fallback.
 */
import '@testing-library/jest-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WorkspaceShell from '@/app/w/[slug]/WorkspaceShell'

// jsdom stub
Element.prototype.scrollIntoView = vi.fn()

// ── Supabase Realtime mock ────────────────────────────────────────────────────
// We hoist the `on` spy so we can read `.mock.calls` per test and extract the
// callback that WorkspaceShell registers. Calling that callback simulates a
// server-pushed message.
const mockOn = vi.hoisted(() => vi.fn())
const mockRemoveChannel = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/client', () => {
  const ch = { on: mockOn, subscribe: vi.fn().mockReturnThis() }
  mockOn.mockReturnValue(ch)
  return {
    createClient: vi.fn().mockReturnValue({
      channel: vi.fn().mockReturnValue(ch),
      removeChannel: mockRemoveChannel,
    }),
  }
})

// ── Fixtures ──────────────────────────────────────────────────────────────────
const WORKSPACE = {
  id: 'ws-1', name: 'Acme', slug: 'acme',
  template: 'startup' as const,
  action_cap: 50, actions_used: 10,
  working_style: 'balanced' as const,
  github_installation_id: null, github_repo: null,
  last_standup_at: null, last_retro_at: null,
  created_at: '2024-01-01T00:00:00Z',
}

const CHANNELS = [
  {
    id: 'ch-1', name: 'engineering', display_name: 'Engineering', workspace_id: 'ws-1',
    bot_role_id: 'bot-1', position: 0, archived: false, created_at: '',
    channel_type: 'channel' as const,
    members: [{ bot_role_id: 'bot-1', display_name: 'Riley', avatar_seed: 'riley-ops-2026', role_key: 'ops', is_primary: true, status: 'online' as const }],
  },
  {
    id: 'ch-2', name: 'product', display_name: 'Product', workspace_id: 'ws-1',
    bot_role_id: 'bot-2', position: 1, archived: false, created_at: '',
    channel_type: 'channel' as const, members: [],
  },
]

const BOT_ROLES = [{ id: 'bot-1', display_name: 'Riley', avatar_seed: 'riley-ops-2026' }]

function makeMsg(overrides: Partial<import('@/lib/supabase/types').MessageWithThread> = {}) {
  return {
    id: 'msg-1', channel_id: 'ch-1',
    author_type: 'bot' as const, author_id: 'bot-1',
    content: 'Hello founder', plan_id: null,
    parent_id: null, reply_count: 0,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

// Default fetch stub: initial channel load returns one message
function stubFetch(messages = [makeMsg()]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => messages,
  } as Response)
}

function renderShell() {
  return render(<WorkspaceShell workspace={WORKSPACE} channels={CHANNELS} botRoles={BOT_ROLES} />)
}

// Helper: get the Realtime callback registered on the first channel subscription
function getRealtimeCallback() {
  // mockOn is called as .on(event, filter, callback) — callback is args[2]
  const call = mockOn.mock.calls.find((c) => typeof c[2] === 'function')
  return call?.[2] as ((payload: { new: unknown }) => void) | undefined
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WorkspaceShell — layout & initial render', () => {
  beforeEach(() => { stubFetch(); vi.clearAllMocks() })

  it('renders workspace name in sidebar', async () => {
    renderShell()
    expect(screen.getByText('Acme')).toBeInTheDocument()
  })

  it('renders active channel name in header', async () => {
    renderShell()
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('# Engineering'))
  })

  it('renders action counter badge in header', async () => {
    renderShell()
    expect(screen.getByText('10 / 50 actions used')).toBeInTheDocument()
  })

  it('fetches messages for the first channel on mount', async () => {
    renderShell()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/messages/ch-1'))
  })

  it('renders messages returned by the initial fetch', async () => {
    renderShell()
    await waitFor(() => expect(screen.getByText('Hello founder')).toBeInTheDocument())
  })

  it('subscribes to Supabase Realtime for the active channel', async () => {
    renderShell()
    await waitFor(() => expect(mockOn).toHaveBeenCalled())
  })
})

describe('WorkspaceShell — channel switching', () => {
  beforeEach(() => { stubFetch(); vi.clearAllMocks() })

  it('fetches messages for the newly selected channel', async () => {
    renderShell()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/messages/ch-1'))

    await userEvent.click(screen.getByTestId('channel-ch-2'))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/messages/ch-2'))
  })

  it('updates the header channel name after switching', async () => {
    renderShell()
    await userEvent.click(screen.getByTestId('channel-ch-2'))
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('# Product')
    )
  })
})

describe('WorkspaceShell — sendMessage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('optimistically inserts the message before the API responds', async () => {
    let resolvePost!: (v: Response) => void
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response) // initial load
      .mockReturnValueOnce(new Promise<Response>((res) => { resolvePost = res }))          // POST

    renderShell()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/messages/ch-1'))

    await userEvent.type(screen.getByRole('textbox'), 'ship it')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    // Optimistic message should appear immediately, before POST resolves
    expect(screen.getByText('ship it')).toBeInTheDocument()
    resolvePost({ ok: true, status: 201, json: async () => ({ id: 'real-msg-id' }) } as Response)
  })

  it('replaces the optimistic message id with the real id on success', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response)
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: 'real-id' }) } as Response)

    renderShell()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/messages/ch-1'))

    await userEvent.type(screen.getByRole('textbox'), 'hello')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument())
  })

  it('removes optimistic message on non-ok response (e.g. 500)', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response)
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)

    renderShell()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/messages/ch-1'))

    await userEvent.type(screen.getByRole('textbox'), 'will fail')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(screen.queryByText('will fail')).not.toBeInTheDocument())
  })

  it('does not send when input is empty', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response)

    renderShell()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/messages/ch-1'))

    // Send button should be disabled with empty input — no POST call
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(global.fetch).toHaveBeenCalledTimes(1) // only the initial load
  })
})

describe('WorkspaceShell — Supabase Realtime push', () => {
  beforeEach(() => { stubFetch([]); vi.clearAllMocks() })

  it('appends a new message when Realtime fires', async () => {
    renderShell()
    await waitFor(() => expect(mockOn).toHaveBeenCalled())

    const callback = getRealtimeCallback()
    expect(callback).toBeDefined()

    await act(async () => {
      callback!({ new: makeMsg({ id: 'pushed-msg', content: 'Realtime arrived' }) })
    })

    expect(screen.getByText('Realtime arrived')).toBeInTheDocument()
  })

  it('deduplicates: does not add a message already in state', async () => {
    stubFetch([makeMsg({ id: 'msg-1', content: 'Already here' })])
    renderShell()
    await waitFor(() => expect(screen.getByText('Already here')).toBeInTheDocument())

    const callback = getRealtimeCallback()
    await act(async () => {
      callback!({ new: makeMsg({ id: 'msg-1', content: 'Already here' }) })
    })

    expect(screen.getAllByText('Already here')).toHaveLength(1)
  })

  it('does NOT increment action counter when a bot message arrives via Realtime', async () => {
    stubFetch([])
    renderShell()
    await waitFor(() => expect(mockOn).toHaveBeenCalled())

    expect(screen.getByText('10 / 50 actions used')).toBeInTheDocument()

    const callback = getRealtimeCallback()
    await act(async () => {
      callback!({ new: makeMsg({ id: 'bot-msg', author_type: 'bot' }) })
    })

    // Counter stays at 10 — only GitHub action execution increments it
    expect(screen.getByText('10 / 50 actions used')).toBeInTheDocument()
    expect(screen.queryByText('11 / 50 actions used')).not.toBeInTheDocument()
  })
})

describe('WorkspaceShell — background poll (every 5s)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-fetches messages every 5 seconds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => [],
    } as Response)

    renderShell()
    await act(async () => { await Promise.resolve() }) // flush initial fetch

    const callsBefore = vi.mocked(global.fetch).mock.calls.length

    await act(async () => { vi.advanceTimersByTime(5000) })
    await act(async () => { await Promise.resolve() })

    expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('syncs action counter from /api/workspace every 10 seconds', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/workspace') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ actionCounter: { used: 30, cap: 50 } }) } as Response)
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] } as Response)
    })
    global.fetch = fetchMock

    renderShell()
    await act(async () => { await Promise.resolve() }) // flush initial fetch

    expect(screen.getByText('10 / 50 actions used')).toBeInTheDocument()

    await act(async () => { vi.advanceTimersByTime(10000) })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() }) // flush promise chain

    expect(fetchMock).toHaveBeenCalledWith('/api/workspace')
    expect(screen.getByText('30 / 50 actions used')).toBeInTheDocument()
  }, 10000)
})

describe('WorkspaceShell — polling fallback (waitingForBot)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls after send and stops when bot reply appears', async () => {
    const botMsg = makeMsg({ id: 'bot-reply', author_type: 'bot', content: 'Done!' })

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response)   // initial load
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: 'real-id' }) } as Response) // POST
      .mockResolvedValue({ ok: true, status: 200, json: async () => [botMsg] } as Response) // poll returns bot msg

    renderShell()
    await act(async () => { await Promise.resolve() }) // flush initial load

    // Use fireEvent (no internal timers) to avoid conflicts with fake timers
    const { fireEvent: fe } = await import('@testing-library/react')
    fe.change(screen.getByRole('textbox'), { target: { value: 'deploy it' } })
    await act(async () => { fe.click(screen.getByRole('button', { name: 'Send' })) })
    await act(async () => { await Promise.resolve() }) // flush POST

    // Advance 3s to trigger the polling fallback interval
    await act(async () => { vi.advanceTimersByTime(3000) })
    await act(async () => { await Promise.resolve() }) // flush poll fetch

    expect(screen.getByText('Done!')).toBeInTheDocument()
  })
})

describe('WorkspaceShell — reset action cap', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows Reset button when actions are at or above 80%', async () => {
    const highUsageWorkspace = { ...WORKSPACE, actions_used: 40, action_cap: 50 } // 80%
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => [],
    } as Response)
    render(<WorkspaceShell workspace={highUsageWorkspace} channels={CHANNELS} botRoles={BOT_ROLES} />)
    await waitFor(() => expect(screen.getByTestId('reset-cap-button')).toBeInTheDocument())
  })

  it('does NOT show Reset button when below 80%', async () => {
    const lowUsageWorkspace = { ...WORKSPACE, actions_used: 30, action_cap: 50 } // 60%
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => [],
    } as Response)
    render(<WorkspaceShell workspace={lowUsageWorkspace} channels={CHANNELS} botRoles={BOT_ROLES} />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('reset-cap-button')).not.toBeInTheDocument()
  })

  it('calls reset-cap API and updates counter on confirm', async () => {
    const highUsageWorkspace = { ...WORKSPACE, actions_used: 40, action_cap: 50 }
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response) // initial load
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, actions_used: 0, action_cap: 50 }) } as Response) // reset-cap POST

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<WorkspaceShell workspace={highUsageWorkspace} channels={CHANNELS} botRoles={BOT_ROLES} />)
    await waitFor(() => expect(screen.getByTestId('reset-cap-button')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('reset-cap-button'))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/workspace/reset-cap', expect.objectContaining({ method: 'POST' })))
    await waitFor(() => expect(screen.getByText('0 / 50 actions used')).toBeInTheDocument())
  })
})

describe('WorkspaceShell — openDm', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useRealTimers() })

  it('calls POST /api/channels to open a DM and navigates to it', async () => {
    const dmChannel = {
      id: 'dm-riley', name: 'dm-ops', display_name: 'Riley', workspace_id: 'ws-1',
      bot_role_id: 'bot-1', position: 99, archived: false, created_at: '',
      channel_type: 'dm' as const, members: [],
    }
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response)  // initial ch-1 load
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => dmChannel } as Response)  // openDm POST
      .mockResolvedValue({ ok: true, status: 200, json: async () => [] } as Response) // subsequent fetches

    renderShell()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    // Click DM contact in sidebar (Sam is a member of Engineering — appears in DMs section)
    const dmBtn = screen.getByTestId('dm-bot-1')
    await userEvent.click(dmBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/channels', expect.objectContaining({ method: 'POST' }))
    })
  })

  it('handles 409 conflict on openDm by navigating to the existing channel', async () => {
    const existingDm = {
      id: 'dm-existing', name: 'dm-ops', display_name: 'Riley', workspace_id: 'ws-1',
      bot_role_id: 'bot-1', position: 99, archived: false, created_at: '',
      channel_type: 'dm' as const, members: [],
    }
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response)  // initial load
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => existingDm } as Response)  // 409 conflict
      .mockResolvedValue({ ok: true, status: 200, json: async () => [] } as Response)

    renderShell()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    const dmBtn = screen.getByTestId('dm-bot-1')
    await userEvent.click(dmBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/channels', expect.objectContaining({ method: 'POST' }))
    })
  })
})
