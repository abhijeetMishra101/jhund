/**
 * @vitest-environment jsdom
 *
 * PipelinePanel — client component that fetches /api/features and renders PipelineView
 */
import '@testing-library/jest-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PipelinePanel } from '@/app/w/[slug]/components/PipelinePanel'

const baseFeature = {
  id: 'f1',
  workspace_id: 'ws-1',
  title: 'Dark Mode Support',
  description: 'Support system dark mode preference',
  stage: 1,
  complexity: 'small' as const,
  status: 'active' as const,
  blocking_reason: null,
  pr_url: null,
  created_at: '2026-05-20T00:00:00Z',
  updated_at: '2026-05-20T00:00:00Z',
  use_case_count: 0,
  verified_count: 0,
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('PipelinePanel', () => {
  it('shows loading state initially', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) // never resolves
    render(<PipelinePanel />)
    expect(screen.getByText(/loading pipeline/i)).toBeInTheDocument()
  })

  it('renders feature cards after successful fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [baseFeature] }),
    } as unknown as Response)

    render(<PipelinePanel />)
    await waitFor(() => {
      expect(screen.getByText('Dark Mode Support')).toBeInTheDocument()
    })
    expect(screen.getByTestId('stage-pill-1')).toHaveTextContent('Idea')
  })

  it('shows empty state when features array is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    } as unknown as Response)

    render(<PipelinePanel />)
    await waitFor(() => {
      expect(screen.getByTestId('pipeline-empty')).toBeInTheDocument()
    })
  })

  it('shows error message when fetch returns non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    } as unknown as Response)

    render(<PipelinePanel />)
    await waitFor(() => {
      expect(screen.getByText(/could not load pipeline/i)).toBeInTheDocument()
    })
  })

  it('shows error message when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    render(<PipelinePanel />)
    await waitFor(() => {
      expect(screen.getByText(/could not load pipeline/i)).toBeInTheDocument()
    })
  })

  it('renders the Pipeline heading', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    } as unknown as Response)

    render(<PipelinePanel />)
    await waitFor(() => {
      expect(screen.getByText('Pipeline')).toBeInTheDocument()
    })
  })

  it('renders multiple feature cards', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          { ...baseFeature, id: 'f1', title: 'Feature Alpha', stage: 1 },
          { ...baseFeature, id: 'f2', title: 'Feature Beta', stage: 5 },
        ],
      }),
    } as unknown as Response)

    render(<PipelinePanel />)
    await waitFor(() => {
      expect(screen.getByText('Feature Alpha')).toBeInTheDocument()
      expect(screen.getByText('Feature Beta')).toBeInTheDocument()
    })
    expect(screen.getByTestId('stage-pill-5')).toHaveTextContent('Build')
  })
})
