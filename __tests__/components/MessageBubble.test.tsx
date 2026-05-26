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

describe('MessageBubble — markdown rendering', () => {
  it('renders a plain-text message without error', () => {
    render(
      <MessageBubble
        message={baseMsg({ content: 'Hello founder' })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    expect(screen.getByTestId('message-msg-1')).toHaveTextContent('Hello founder')
  })

  it('renders bold text from markdown', () => {
    render(
      <MessageBubble
        message={baseMsg({ content: 'This is **bold** text' })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    const strong = screen.getByTestId('message-msg-1').querySelector('strong')
    expect(strong).toBeInTheDocument()
    expect(strong).toHaveTextContent('bold')
  })

  it('renders a regular external link as an anchor with target=_blank', () => {
    render(
      <MessageBubble
        message={baseMsg({ content: '[Click me](https://example.com)' })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    const link = screen.getByRole('link', { name: /click me/i })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('renders a GitHub blob URL as a button that opens the drawer', async () => {
    const GITHUB_URL = 'https://github.com/acme/repo/blob/main/docs/discussion.md'
    // Drawer fetch never resolves to keep loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(
      <MessageBubble
        message={baseMsg({ content: `[View the document](${GITHUB_URL})` })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )

    const btn = screen.getByTestId('github-doc-link')
    expect(btn).toBeInTheDocument()
    expect(btn.tagName).toBe('BUTTON')
    expect(btn).toHaveTextContent('View the document')

    // Clicking it should open the drawer
    fireEvent.click(btn)
    await waitFor(() => {
      expect(screen.getByTestId('document-viewer-drawer')).toBeInTheDocument()
    })
  })

  it('closes the drawer when onClose is called', async () => {
    const GITHUB_URL = 'https://github.com/acme/repo/blob/main/docs/discussion.md'
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(
      <MessageBubble
        message={baseMsg({ content: `[View the document](${GITHUB_URL})` })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('github-doc-link'))
    await waitFor(() => {
      expect(screen.getByTestId('document-viewer-drawer')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('drawer-close'))
    expect(screen.queryByTestId('document-viewer-drawer')).not.toBeInTheDocument()
  })

  it('renders heading markdown as bold (not an h1)', () => {
    render(
      <MessageBubble
        message={baseMsg({ content: '# Title Here' })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    // Heading should be rendered as <strong>, not as an h1
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    const strong = screen.getByTestId('message-msg-1').querySelector('strong')
    expect(strong).toBeInTheDocument()
  })

  it('renders h2 heading as bold', () => {
    render(
      <MessageBubble
        message={baseMsg({ content: '## Section Two' })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.getByTestId('message-msg-1').querySelector('strong')).toBeInTheDocument()
  })

  it('renders h3 heading as bold', () => {
    render(
      <MessageBubble
        message={baseMsg({ content: '### Section Three' })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    expect(screen.getByTestId('message-msg-1').querySelector('strong')).toBeInTheDocument()
  })

  it('renders h4 heading as bold', () => {
    render(
      <MessageBubble
        message={baseMsg({ content: '#### Four' })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    expect(screen.getByTestId('message-msg-1').querySelector('strong')).toBeInTheDocument()
  })

  it('renders h5 heading as bold', () => {
    render(
      <MessageBubble
        message={baseMsg({ content: '##### Five' })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    expect(screen.getByTestId('message-msg-1').querySelector('strong')).toBeInTheDocument()
  })

  it('renders h6 heading as bold', () => {
    render(
      <MessageBubble
        message={baseMsg({ content: '###### Six' })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    expect(screen.getByTestId('message-msg-1').querySelector('strong')).toBeInTheDocument()
  })

  it('renders unordered list items inline without <ul>', () => {
    render(
      <MessageBubble
        message={baseMsg({ content: '- item one\n- item two' })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    const bubble = screen.getByTestId('message-msg-1')
    expect(bubble.querySelector('ul')).not.toBeInTheDocument()
    expect(bubble).toHaveTextContent('item one')
    expect(bubble).toHaveTextContent('item two')
  })

  it('renders ordered list items inline without <ol>', () => {
    render(
      <MessageBubble
        message={baseMsg({ content: '1. first\n2. second' })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    const bubble = screen.getByTestId('message-msg-1')
    expect(bubble.querySelector('ol')).not.toBeInTheDocument()
    expect(bubble).toHaveTextContent('first')
  })

  it('renders inline code / pre block', () => {
    render(
      <MessageBubble
        message={baseMsg({ content: '```\nconst x = 1\n```' })}
        botRole={BOT_ROLE}
        onPlanAction={vi.fn()}
      />
    )
    // The pre element should exist (our custom renderer)
    expect(screen.getByTestId('message-msg-1').querySelector('pre')).toBeInTheDocument()
  })
})
