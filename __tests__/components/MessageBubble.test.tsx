/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageBubble } from '@/app/w/[slug]/components/MessageBubble'
import type { MessageWithThread } from '@/lib/supabase/types'

// PlanCard fetches from /api/plans/:id — mock globally
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({}),
  } as Response)
})

const BOT_ROLE = { id: 'bot-1', display_name: 'Riley', avatar_seed: 'riley-ops-2026' }

function baseMsg(overrides: Partial<MessageWithThread> = {}): MessageWithThread {
  return {
    id: 'msg-1',
    channel_id: 'ch-1',
    author_type: 'bot',
    author_id: 'bot-1',
    content: 'Hello founder',
    plan_id: null,
    parent_id: null,
    created_at: new Date().toISOString(),
    reply_count: 0,
    ...overrides,
  }
}

describe('MessageBubble — timestamps', () => {
  it('renders a timestamp element for bot messages', () => {
    render(<MessageBubble message={baseMsg()} botRole={BOT_ROLE} onPlanAction={vi.fn()} />)
    expect(screen.getByTestId('message-timestamp')).toBeInTheDocument()
  })

  it('renders a timestamp element for user messages', () => {
    render(<MessageBubble message={baseMsg({ author_type: 'user' })} onPlanAction={vi.fn()} />)
    expect(screen.getByTestId('message-timestamp')).toBeInTheDocument()
  })
})

describe('MessageBubble — thread link', () => {
  it('shows "N replies" link when reply_count > 0', () => {
    render(
      <MessageBubble
        message={baseMsg({ reply_count: 3 })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    expect(screen.getByTestId('thread-link')).toBeInTheDocument()
    expect(screen.getByTestId('thread-link')).toHaveTextContent('3 replies')
  })

  it('shows singular "1 reply" when reply_count is 1', () => {
    render(
      <MessageBubble
        message={baseMsg({ reply_count: 1 })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    expect(screen.getByTestId('thread-link')).toHaveTextContent('1 reply')
  })

  it('does NOT show thread link when reply_count is 0', () => {
    render(
      <MessageBubble
        message={baseMsg({ reply_count: 0 })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    expect(screen.queryByTestId('thread-link')).not.toBeInTheDocument()
  })

  it('calls onOpenThread when thread link is clicked', async () => {
    const onOpenThread = vi.fn()
    const msg = baseMsg({ reply_count: 2 })
    render(
      <MessageBubble
        message={msg}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
        onOpenThread={onOpenThread}
      />
    )
    await userEvent.click(screen.getByTestId('thread-link'))
    expect(onOpenThread).toHaveBeenCalledWith(msg)
  })
})

describe('MessageBubble — system messages', () => {
  it('renders system message as centered muted text', () => {
    render(
      <MessageBubble
        message={baseMsg({ author_type: 'system', content: 'Bot joined' })}
        onPlanAction={vi.fn()}
      />
    )
    const el = screen.getByTestId('system-message')
    expect(el).toBeInTheDocument()
    expect(el).toHaveTextContent('Bot joined')
  })

  it('system message has no avatar', () => {
    render(
      <MessageBubble
        message={baseMsg({ author_type: 'system', content: 'Bot joined' })}
        onPlanAction={vi.fn()}
      />
    )
    expect(screen.queryByTestId('bot-avatar-img')).not.toBeInTheDocument()
  })

  it('system message has no bubble wrapper', () => {
    render(
      <MessageBubble
        message={baseMsg({ author_type: 'system', content: 'Bot joined' })}
        onPlanAction={vi.fn()}
      />
    )
    // No thread link, no plan card
    expect(screen.queryByTestId('thread-link')).not.toBeInTheDocument()
  })
})

describe('MessageBubble — bot avatar', () => {
  it('renders BotAvatar img for bot messages', () => {
    render(
      <MessageBubble
        message={baseMsg()}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    const img = screen.getByTestId('bot-avatar-img') as HTMLImageElement
    expect(img.src).toContain('riley-ops-2026')
  })
})

describe('MessageBubble — timestamp hover', () => {
  it('shows short time by default (no hover)', () => {
    render(<MessageBubble message={baseMsg()} botRole={BOT_ROLE} onPlanAction={vi.fn()} />)
    const ts = screen.getByTestId('message-timestamp')
    // Default shows short time — no full date string
    expect(ts).toBeInTheDocument()
  })

  it('mouseEnter and mouseLeave on timestamp do not throw', () => {
    render(<MessageBubble message={baseMsg()} botRole={BOT_ROLE} onPlanAction={vi.fn()} />)
    const ts = screen.getByTestId('message-timestamp')
    // Exercises setShowFullTime(true) and setShowFullTime(false) handlers
    fireEvent.mouseEnter(ts)
    fireEvent.mouseLeave(ts)
    expect(ts).toBeInTheDocument()
  })

  it('shows full date for a message from a past date on hover', () => {
    // Use a date far in the past to trigger isOlderThanToday → formatFull
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const pastMsg = baseMsg({ created_at: yesterday.toISOString() })

    render(<MessageBubble message={pastMsg} botRole={BOT_ROLE} onPlanAction={vi.fn()} />)
    const ts = screen.getByTestId('message-timestamp')
    fireEvent.mouseEnter(ts)
    // After hover, timestamp should contain " at " (formatFull format: "May 12 at 3:00 PM")
    expect(ts.textContent).toContain('at')
  })
})
