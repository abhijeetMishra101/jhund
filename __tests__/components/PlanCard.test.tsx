/**
 * @vitest-environment jsdom
 *
 * End-to-end approval card tests:
 *
 * These tests stand in for the missing Playwright suite and verify the
 * exact conditions required for the approval card to appear and work:
 *
 *   1. Backend contract — plan_id is in the messages GET response (covered
 *      in messages-channel.test.ts; we rely on that here)
 *   2. PlanCard component — renders correctly for every plan status
 *   3. MessageBubble wiring — card appears iff author_type=bot AND plan_id set
 */
import '@testing-library/jest-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanCard } from '@/app/w/[slug]/components/PlanCard'
import { MessageBubble } from '@/app/w/[slug]/components/MessageBubble'

// WorkspaceShell imports createClient from supabase/client at module level — mock it
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn().mockReturnValue({
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  }),
}))

const PLAN_ID = 'plan-uuid'

function makePlan(status: string, description = 'Open an issue titled "Fix login bug"') {
  return { id: PLAN_ID, status, description_md: description }
}

// ─── PlanCard ────────────────────────────────────────────────────────────────

describe('PlanCard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  it('shows loading state before the plan is fetched', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {})) // never resolves
    const onAction = vi.fn()
    render(<PlanCard planId={PLAN_ID} onAction={onAction} />)
    expect(screen.getByText('Loading action…')).toBeInTheDocument()
  })

  it('renders plan description and Approve/Reject buttons for a pending plan', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => makePlan('pending'),
    } as Response)

    render(<PlanCard planId={PLAN_ID} onAction={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Open an issue titled "Fix login bug"')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
    expect(screen.queryByText('Waiting for your approval')).not.toBeInTheDocument() // status label hidden when pending; buttons shown instead
  })

  it.each([
    ['approved', 'Approved — running…'],
    ['rejected',  'Rejected'],
    ['executed',  'Done'],
    ['failed',    'Failed'],
  ])('shows status label "%s" and hides action buttons', async (status, label) => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => makePlan(status),
    } as Response)

    render(<PlanCard planId={PLAN_ID} onAction={vi.fn()} />)

    await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })

  it('calls POST /api/plans/[id]/approve and fires onAction when Approve is clicked', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => makePlan('pending') } as Response)  // GET plan
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)                 // POST approve

    const onAction = vi.fn()
    render(<PlanCard planId={PLAN_ID} onAction={onAction} />)
    await waitFor(() => screen.getByRole('button', { name: 'Approve' }))

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `/api/plans/${PLAN_ID}/approve`,
      { method: 'POST' }
    )
    expect(onAction).toHaveBeenCalledWith(PLAN_ID, 'approved')
  })

  it('calls POST /api/plans/[id]/reject and fires onAction when Reject is clicked', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => makePlan('pending') } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)

    const onAction = vi.fn()
    render(<PlanCard planId={PLAN_ID} onAction={onAction} />)
    await waitFor(() => screen.getByRole('button', { name: 'Reject' }))

    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `/api/plans/${PLAN_ID}/reject`,
      { method: 'POST' }
    )
    expect(onAction).toHaveBeenCalledWith(PLAN_ID, 'rejected')
  })

  it('disables buttons while request is in flight', async () => {
    let resolveApprove!: (v: unknown) => void
    const approvePromise = new Promise((res) => { resolveApprove = res })

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => makePlan('pending') } as Response)
      .mockReturnValueOnce(approvePromise as Promise<Response>)

    render(<PlanCard planId={PLAN_ID} onAction={vi.fn()} />)
    await waitFor(() => screen.getByRole('button', { name: 'Approve' }))

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled()

    resolveApprove({ ok: true, json: async () => ({}) })
  })

  it('does not show card at all when plan fetch fails', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response)

    render(<PlanCard planId={PLAN_ID} onAction={vi.fn()} />)

    // Loading state shown initially, then nothing (no plan rendered)
    await waitFor(() =>
      expect(screen.queryByText('Open an issue')).not.toBeInTheDocument()
    )
  })
})

// ─── MessageBubble wiring ────────────────────────────────────────────────────

describe('MessageBubble — PlanCard wiring', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  const baseMessage = {
    id: 'msg-1',
    channel_id: 'ch-1',
    author_id: 'bot-id',
    content: 'I will open a GitHub issue.',
    created_at: '2024-01-01T00:00:00Z',
  }

  it('renders PlanCard below a bot message that has a plan_id', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => makePlan('pending'),
    } as Response)

    const message = { ...baseMessage, author_type: 'bot' as const, plan_id: PLAN_ID }
    render(<MessageBubble message={message} onPlanAction={vi.fn()} />)

    // PlanCard fetches on mount — wait for description to appear
    await waitFor(() =>
      expect(screen.getByText('Open an issue titled "Fix login bug"')).toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('does NOT render PlanCard for a bot message without plan_id', () => {
    const message = { ...baseMessage, author_type: 'bot' as const, plan_id: null }
    render(<MessageBubble message={message} onPlanAction={vi.fn()} />)
    expect(screen.queryByText('Loading action…')).not.toBeInTheDocument()
  })

  it('does NOT render PlanCard for a user message even if plan_id is set', () => {
    const message = { ...baseMessage, author_type: 'user' as const, plan_id: PLAN_ID }
    render(<MessageBubble message={message} onPlanAction={vi.fn()} />)
    expect(screen.queryByText('Loading action…')).not.toBeInTheDocument()
  })

  it('renders a system message as a centred banner — no PlanCard', () => {
    const message = { ...baseMessage, author_type: 'system' as const, plan_id: null, content: 'Approved — executing now…' }
    render(<MessageBubble message={message} onPlanAction={vi.fn()} />)
    expect(screen.getByText('Approved — executing now…')).toBeInTheDocument()
    expect(screen.queryByText('Loading action…')).not.toBeInTheDocument()
  })

  it('calls onPlanAction with planId and new status after approval', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => makePlan('pending') } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)

    const onPlanAction = vi.fn()
    const message = { ...baseMessage, author_type: 'bot' as const, plan_id: PLAN_ID }
    render(<MessageBubble message={message} onPlanAction={onPlanAction} />)

    await waitFor(() => screen.getByRole('button', { name: 'Approve' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(onPlanAction).toHaveBeenCalledWith(PLAN_ID, 'approved')
  })
})
