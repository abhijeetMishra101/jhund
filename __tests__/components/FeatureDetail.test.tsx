/**
 * @vitest-environment jsdom
 *
 * Tests for FeatureDetail — the feature detail panel component.
 * Mocks fetch to avoid real HTTP calls.
 */
import '@testing-library/jest-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FeatureDetail } from '@/app/w/[slug]/components/FeatureDetail'
import type { Feature, FeatureUseCase, GateEvent } from '@/lib/supabase/types'

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-001',
    workspace_id: 'ws-001',
    title: 'Dark mode support',
    description: 'Add system dark mode preference',
    stage: 2,
    complexity: 'small',
    status: 'active',
    blocking_reason: null,
    pr_url: null,
    created_at: '2026-05-20T00:00:00Z',
    updated_at: '2026-05-20T00:00:00Z',
    ...overrides,
  }
}

function makeUseCase(overrides: Partial<FeatureUseCase> = {}): FeatureUseCase {
  return {
    id: 'uc-001',
    feature_id: 'feat-001',
    uc_id: 'UC-1',
    description: 'User sees dark background',
    verified_at: null,
    waived_at: null,
    waive_reason: null,
    created_at: '2026-05-20T00:00:00Z',
    ...overrides,
  }
}

function makeGateEvent(overrides: Partial<GateEvent> = {}): GateEvent {
  return {
    id: 'gate-001',
    feature_id: 'feat-001',
    from_stage: 1,
    to_stage: 2,
    gate_type: 'bot_signoff',
    actor_role: 'product',
    notes: 'Use cases documented',
    created_at: '2026-05-20T00:00:00Z',
    ...overrides,
  }
}

function mockFetchSuccess(feature: Feature, use_cases: FeatureUseCase[] = [], gate_history: GateEvent[] = []) {
  vi.mocked(global.fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ feature, use_cases, gate_history }),
  } as Response)
}

function mockFetchError() {
  vi.mocked(global.fetch).mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: 'Not found' }),
  } as Response)
}

describe('FeatureDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('shows loading state initially', () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {})) // never resolves
    render(<FeatureDetail featureId="feat-001" />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders feature title and description after fetch', async () => {
    mockFetchSuccess(makeFeature())
    render(<FeatureDetail featureId="feat-001" />)

    await waitFor(() => {
      expect(screen.getByTestId('feature-detail')).toBeInTheDocument()
    })
    expect(screen.getByText('Dark mode support')).toBeInTheDocument()
    expect(screen.getByText('Add system dark mode preference')).toBeInTheDocument()
  })

  it('shows stage name instead of stage number', async () => {
    mockFetchSuccess(makeFeature({ stage: 2 }))
    render(<FeatureDetail featureId="feat-001" />)

    await waitFor(() => expect(screen.getByTestId('feature-detail')).toBeInTheDocument())
    expect(screen.getByText(/Requirements/)).toBeInTheDocument()
  })

  it('shows error state when fetch fails', async () => {
    mockFetchError()
    render(<FeatureDetail featureId="feat-001" />)

    await waitFor(() => {
      expect(screen.getByText(/could not load feature details/i)).toBeInTheDocument()
    })
  })

  it('shows error state when fetch throws', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))
    render(<FeatureDetail featureId="feat-001" />)

    await waitFor(() => {
      expect(screen.getByText(/could not load feature details/i)).toBeInTheDocument()
    })
  })

  it('renders use cases with verified checkmark', async () => {
    const uc = makeUseCase({ verified_at: '2026-05-20T10:00:00Z' })
    mockFetchSuccess(makeFeature(), [uc])
    render(<FeatureDetail featureId="feat-001" />)

    await waitFor(() => expect(screen.getByTestId('feature-detail')).toBeInTheDocument())
    expect(screen.getByText(/UC-1: User sees dark background/)).toBeInTheDocument()
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('renders waived use case with "Waived" label', async () => {
    const uc = makeUseCase({ waived_at: '2026-05-20T10:00:00Z', waive_reason: 'Not in scope' })
    mockFetchSuccess(makeFeature(), [uc])
    render(<FeatureDetail featureId="feat-001" />)

    await waitFor(() => expect(screen.getByTestId('feature-detail')).toBeInTheDocument())
    expect(screen.getByText(/Waived.*Not in scope/i)).toBeInTheDocument()
  })

  it('renders unverified use case with empty circle', async () => {
    const uc = makeUseCase()
    mockFetchSuccess(makeFeature(), [uc])
    render(<FeatureDetail featureId="feat-001" />)

    await waitFor(() => expect(screen.getByTestId('feature-detail')).toBeInTheDocument())
    expect(screen.getByText('○')).toBeInTheDocument()
  })

  it('renders gate history', async () => {
    const gate = makeGateEvent()
    mockFetchSuccess(makeFeature(), [], [gate])
    render(<FeatureDetail featureId="feat-001" />)

    await waitFor(() => expect(screen.getByTestId('feature-detail')).toBeInTheDocument())
    expect(screen.getByText(/Idea.*→.*Requirements/i)).toBeInTheDocument()
    expect(screen.getByText(/by product/i)).toBeInTheDocument()
  })

  it('shows blocked warning when status is blocked', async () => {
    const f = makeFeature({ status: 'blocked', blocking_reason: 'Design review failed' })
    mockFetchSuccess(f)
    render(<FeatureDetail featureId="feat-001" />)

    await waitFor(() => expect(screen.getByTestId('feature-detail')).toBeInTheDocument())
    expect(screen.getByTestId('blocked-reason')).toBeInTheDocument()
    expect(screen.getByText(/Design review failed/)).toBeInTheDocument()
  })

  it('fetches with the correct feature id URL', async () => {
    mockFetchSuccess(makeFeature({ id: 'feat-xyz' }))
    render(<FeatureDetail featureId="feat-xyz" />)

    await waitFor(() => expect(screen.getByTestId('feature-detail')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledWith('/api/features/feat-xyz')
  })
})
