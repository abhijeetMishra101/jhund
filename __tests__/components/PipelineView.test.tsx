/**
 * @vitest-environment jsdom
 *
 * UC-16-01: Pipeline renders feature cards with stage pill name (not stage number)
 * UC-16-02: Blocked feature shows red "Blocked" badge
 * UC-16-03: Empty state renders when features array is empty
 */
import '@testing-library/jest-dom'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineView } from '@/app/w/[slug]/components/PipelineView'
import type { Feature } from '@/lib/supabase/types'

type EnrichedFeature = Feature & { use_case_count?: number; verified_count?: number }

function makeFeature(overrides: Partial<EnrichedFeature> = {}): EnrichedFeature {
  return {
    id: 'feat-001',
    workspace_id: 'ws-001',
    title: 'Add dark mode',
    description: 'Support system dark mode preference',
    stage: 1,
    complexity: 'small',
    status: 'active',
    blocking_reason: null,
    pr_url: null,
    created_at: '2026-05-20T00:00:00Z',
    updated_at: '2026-05-20T00:00:00Z',
    use_case_count: 0,
    verified_count: 0,
    ...overrides,
  }
}

describe('PipelineView', () => {
  it('UC-16-03: shows empty state when features is empty', () => {
    render(<PipelineView features={[]} />)
    expect(screen.getByTestId('pipeline-empty')).toBeInTheDocument()
    expect(screen.getByText(/ask Alex to add one/i)).toBeInTheDocument()
  })

  it('UC-16-01: renders feature card with stage name (not stage number)', () => {
    render(<PipelineView features={[makeFeature({ stage: 1 })]} />)
    const pill = screen.getByTestId('stage-pill-1')
    expect(pill).toHaveTextContent('Idea')
    // Must NOT show "Stage 1" raw number as the pill text
    expect(pill).not.toHaveTextContent('Stage 1')
  })

  it('UC-16-01: stage 2 pill shows "Requirements"', () => {
    render(<PipelineView features={[makeFeature({ stage: 2 })]} />)
    expect(screen.getByTestId('stage-pill-2')).toHaveTextContent('Requirements')
  })

  it('UC-16-01: stage 7 pill shows "Shipped"', () => {
    render(<PipelineView features={[makeFeature({ stage: 7, status: 'shipped' })]} />)
    expect(screen.getByTestId('stage-pill-7')).toHaveTextContent('Shipped')
  })

  it('UC-16-02: blocked feature shows red "Blocked" badge', () => {
    const f = makeFeature({
      status: 'blocked',
      blocking_reason: 'Waiting on design sign-off',
    })
    render(<PipelineView features={[f]} />)
    expect(screen.getByTestId('status-blocked')).toBeInTheDocument()
    expect(screen.getByTestId('status-blocked')).toHaveTextContent('Blocked')
  })

  it('UC-16-02: active feature does NOT show Blocked badge', () => {
    render(<PipelineView features={[makeFeature({ status: 'active' })]} />)
    expect(screen.queryByTestId('status-blocked')).not.toBeInTheDocument()
  })

  it('renders feature title', () => {
    render(<PipelineView features={[makeFeature({ title: 'Offline mode' })]} />)
    expect(screen.getByText('Offline mode')).toBeInTheDocument()
  })

  it('shows use case count when present', () => {
    render(<PipelineView features={[makeFeature({ use_case_count: 3, verified_count: 1 })]} />)
    expect(screen.getByText(/3 use cases/i)).toBeInTheDocument()
    expect(screen.getByText(/1 verified/i)).toBeInTheDocument()
  })

  it('renders multiple feature cards', () => {
    const features = [
      makeFeature({ id: 'f1', title: 'Feature Alpha', stage: 1 }),
      makeFeature({ id: 'f2', title: 'Feature Beta', stage: 5 }),
    ]
    render(<PipelineView features={features} />)
    expect(screen.getByText('Feature Alpha')).toBeInTheDocument()
    expect(screen.getByText('Feature Beta')).toBeInTheDocument()
    expect(screen.getByTestId('stage-pill-5')).toHaveTextContent('Build')
  })

  it('shows blocking_reason text on blocked feature card', () => {
    const f = makeFeature({ status: 'blocked', blocking_reason: 'Missing QA sign-off' })
    render(<PipelineView features={[f]} />)
    expect(screen.getByText(/Missing QA sign-off/)).toBeInTheDocument()
  })
})
