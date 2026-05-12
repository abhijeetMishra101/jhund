/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MessageThread } from '@/app/w/[slug]/components/MessageThread'
import { createRef } from 'react'

// PlanCard fetches from /api/plans/:id — mock fetch globally
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'plan-1', status: 'pending', description_md: 'Open an issue' }),
  } as Response)
})

const BOT_ROLE_MAP = { 'bot-id': { id: 'bot-id', display_name: 'Riley' } }

function baseMessage(overrides = {}) {
  return {
    id: 'msg-1',
    channel_id: 'ch-1',
    author_type: 'bot' as const,
    author_id: 'bot-id',
    content: 'Hello founder',
    plan_id: null,
    parent_id: null,
    reply_count: 0,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('MessageThread', () => {
  const bottomRef = createRef<HTMLDivElement>()

  it('shows loading state', () => {
    render(<MessageThread messages={[]} loading botRoleMap={{}} onPlanAction={vi.fn()} bottomRef={bottomRef} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows empty state when no messages and not loading', () => {
    render(<MessageThread messages={[]} loading={false} botRoleMap={{}} onPlanAction={vi.fn()} bottomRef={bottomRef} />)
    expect(screen.getByText(/No messages yet/)).toBeInTheDocument()
  })

  it('renders each message', () => {
    const messages = [
      baseMessage({ id: 'msg-1', content: 'Hello founder' }),
      baseMessage({ id: 'msg-2', content: 'How can I help?', author_type: 'user', author_id: 'user-1' }),
    ]
    render(<MessageThread messages={messages} loading={false} botRoleMap={BOT_ROLE_MAP} onPlanAction={vi.fn()} bottomRef={bottomRef} />)
    expect(screen.getByText('Hello founder')).toBeInTheDocument()
    expect(screen.getByText('How can I help?')).toBeInTheDocument()
  })

  it('renders PlanCard for a bot message with plan_id', async () => {
    const messages = [baseMessage({ plan_id: 'plan-1', author_type: 'bot', author_id: 'bot-id' })]
    render(<MessageThread messages={messages} loading={false} botRoleMap={BOT_ROLE_MAP} onPlanAction={vi.fn()} bottomRef={bottomRef} />)
    await waitFor(() => expect(screen.getByText('Open an issue')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('does not show loading or empty when messages are present', () => {
    render(<MessageThread messages={[baseMessage()]} loading={false} botRoleMap={BOT_ROLE_MAP} onPlanAction={vi.fn()} bottomRef={bottomRef} />)
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    expect(screen.queryByText(/No messages yet/)).not.toBeInTheDocument()
  })
})
