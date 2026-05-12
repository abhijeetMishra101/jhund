/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThreadPanel } from '@/app/w/[slug]/components/ThreadPanel'
import type { MessageWithThread } from '@/lib/supabase/types'

// jsdom stub
Element.prototype.scrollIntoView = vi.fn()

// Capture Realtime callback so tests can trigger it manually
let realtimePayloadHandler: ((payload: { new: unknown }) => void) | null = null

vi.mock('@/lib/supabase/client', () => {
  const ch = {
    on: vi.fn().mockImplementation((_event: string, _filter: unknown, cb: (p: { new: unknown }) => void) => {
      realtimePayloadHandler = cb
      return ch
    }),
    subscribe: vi.fn().mockReturnThis(),
  }
  return {
    createClient: vi.fn().mockReturnValue({
      channel: vi.fn().mockReturnValue(ch),
      removeChannel: vi.fn(),
    }),
  }
})

const BOT_ROLE_MAP = {
  'bot-1': { id: 'bot-1', display_name: 'Riley', avatar_seed: 'riley-ops-2026' },
}

function makeParent(overrides: Partial<MessageWithThread> = {}): MessageWithThread {
  return {
    id: 'parent-1',
    channel_id: 'ch-1',
    author_type: 'bot',
    author_id: 'bot-1',
    content: 'This is the parent message',
    plan_id: null,
    parent_id: null,
    created_at: new Date().toISOString(),
    reply_count: 2,
    ...overrides,
  }
}

function makeReply(id: string, content: string): MessageWithThread {
  return {
    id,
    channel_id: 'ch-1',
    author_type: 'user',
    author_id: 'user-1',
    content,
    plan_id: null,
    created_at: new Date().toISOString(),
    reply_count: 0,
    parent_id: 'parent-1',
  }
}

function stubFetchReplies(replies: MessageWithThread[] = []) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ replies }),
  } as Response)
}

describe('ThreadPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    realtimePayloadHandler = null
  })

  it('renders the parent message content', async () => {
    stubFetchReplies()
    render(
      <ThreadPanel
        parentMessage={makeParent()}
        channelId="ch-1"
        botRoleMap={BOT_ROLE_MAP}
        onClose={vi.fn()}
        onPlanAction={vi.fn()}
      />
    )
    expect(screen.getByTestId('thread-parent')).toBeInTheDocument()
    expect(screen.getByText('This is the parent message')).toBeInTheDocument()
  })

  it('renders "Thread" as the panel heading', async () => {
    stubFetchReplies()
    render(
      <ThreadPanel
        parentMessage={makeParent()}
        channelId="ch-1"
        botRoleMap={BOT_ROLE_MAP}
        onClose={vi.fn()}
        onPlanAction={vi.fn()}
      />
    )
    expect(screen.getByText('Thread')).toBeInTheDocument()
  })

  it('fetches and renders replies', async () => {
    stubFetchReplies([makeReply('r-1', 'First reply'), makeReply('r-2', 'Second reply')])
    render(
      <ThreadPanel
        parentMessage={makeParent()}
        channelId="ch-1"
        botRoleMap={BOT_ROLE_MAP}
        onClose={vi.fn()}
        onPlanAction={vi.fn()}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('First reply')).toBeInTheDocument()
      expect(screen.getByText('Second reply')).toBeInTheDocument()
    })
  })

  it('calls fetch with the correct thread URL', async () => {
    stubFetchReplies()
    render(
      <ThreadPanel
        parentMessage={makeParent()}
        channelId="ch-1"
        botRoleMap={BOT_ROLE_MAP}
        onClose={vi.fn()}
        onPlanAction={vi.fn()}
      />
    )
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/ch-1/threads/parent-1'
      )
    })
  })

  it('calls onClose when the X button is clicked', async () => {
    stubFetchReplies()
    const onClose = vi.fn()
    render(
      <ThreadPanel
        parentMessage={makeParent()}
        channelId="ch-1"
        botRoleMap={BOT_ROLE_MAP}
        onClose={onClose}
        onPlanAction={vi.fn()}
      />
    )
    await userEvent.click(screen.getByTestId('thread-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows empty state when there are no replies', async () => {
    stubFetchReplies([])
    render(
      <ThreadPanel
        parentMessage={makeParent({ reply_count: 0 })}
        channelId="ch-1"
        botRoleMap={BOT_ROLE_MAP}
        onClose={vi.fn()}
        onPlanAction={vi.fn()}
      />
    )
    await waitFor(() => {
      expect(screen.getByText(/No replies yet/)).toBeInTheDocument()
    })
  })

  it('shows empty replies when fetch throws (catch block)', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('network error'))
    render(
      <ThreadPanel
        parentMessage={makeParent()}
        channelId="ch-1"
        botRoleMap={BOT_ROLE_MAP}
        onClose={vi.fn()}
        onPlanAction={vi.fn()}
      />
    )
    await waitFor(() => {
      expect(screen.getByText(/No replies yet/)).toBeInTheDocument()
    })
  })

  it('removes optimistic message when POST returns non-ok', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ replies: [] }) } as Response)
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)

    render(
      <ThreadPanel
        parentMessage={makeParent()}
        channelId="ch-1"
        botRoleMap={BOT_ROLE_MAP}
        onClose={vi.fn()}
        onPlanAction={vi.fn()}
      />
    )
    await waitFor(() => expect(screen.getByText(/No replies yet/)).toBeInTheDocument())

    await userEvent.type(screen.getByRole('textbox'), 'My reply')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    // Optimistic message is briefly shown then removed on failure
    await waitFor(() => {
      expect(screen.queryByText('My reply')).not.toBeInTheDocument()
    })
  })

  it('Realtime INSERT appends new message matching parent_id', async () => {
    stubFetchReplies([])
    render(
      <ThreadPanel
        parentMessage={makeParent()}
        channelId="ch-1"
        botRoleMap={BOT_ROLE_MAP}
        onClose={vi.fn()}
        onPlanAction={vi.fn()}
      />
    )
    await waitFor(() => expect(screen.getByText(/No replies yet/)).toBeInTheDocument())

    // Simulate Realtime INSERT for a reply to this thread
    const newMsg = makeReply('rt-1', 'Realtime reply')
    act(() => { realtimePayloadHandler?.({ new: newMsg }) })

    await waitFor(() => {
      expect(screen.getByText('Realtime reply')).toBeInTheDocument()
    })
  })

  it('Realtime INSERT ignores messages with a different parent_id', async () => {
    stubFetchReplies([])
    render(
      <ThreadPanel
        parentMessage={makeParent()}
        channelId="ch-1"
        botRoleMap={BOT_ROLE_MAP}
        onClose={vi.fn()}
        onPlanAction={vi.fn()}
      />
    )
    await waitFor(() => expect(screen.getByText(/No replies yet/)).toBeInTheDocument())

    // parent_id differs — should NOT be added
    const wrongMsg = { ...makeReply('rt-x', 'Wrong thread'), parent_id: 'other-parent' }
    act(() => { realtimePayloadHandler?.({ new: wrongMsg }) })

    await waitFor(() => {
      expect(screen.queryByText('Wrong thread')).not.toBeInTheDocument()
    })
  })

  it('shows formatted date for a reply from a past date', async () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const oldReply: MessageWithThread = {
      ...makeReply('old-1', 'Old reply'),
      created_at: yesterday.toISOString(),
    }
    stubFetchReplies([oldReply])
    render(
      <ThreadPanel
        parentMessage={makeParent()}
        channelId="ch-1"
        botRoleMap={BOT_ROLE_MAP}
        onClose={vi.fn()}
        onPlanAction={vi.fn()}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('Old reply')).toBeInTheDocument()
    })
    // formatFull was called — timestamp should contain " at " for past dates
    const timestamps = document.querySelectorAll('.text-\\[10px\\]')
    const atTimestamps = Array.from(timestamps).filter((el) => el.textContent?.includes('at'))
    expect(atTimestamps.length).toBeGreaterThan(0)
  })

  it('reply input sends with parent_id', async () => {
    stubFetchReplies([])
    // After initial fetch, subsequent POSTs return a real id
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ replies: [] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'new-reply-id' }) } as Response)

    render(
      <ThreadPanel
        parentMessage={makeParent()}
        channelId="ch-1"
        botRoleMap={BOT_ROLE_MAP}
        onClose={vi.fn()}
        onPlanAction={vi.fn()}
      />
    )
    await waitFor(() => expect(screen.getByText(/No replies yet/)).toBeInTheDocument())

    await userEvent.type(screen.getByRole('textbox'), 'A thread reply')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      const calls = vi.mocked(global.fetch).mock.calls
      const postCall = calls.find((c) => c[1] && (c[1] as RequestInit).method === 'POST')
      expect(postCall).toBeDefined()
      const body = JSON.parse((postCall![1] as RequestInit).body as string)
      expect(body.parent_id).toBe('parent-1')
    })
  })
})
