/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { DocumentViewerDrawer } from '@/app/w/[slug]/components/DocumentViewerDrawer'

const GITHUB_URL = 'https://github.com/acme/repo/blob/main/docs/discussion.md'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('DocumentViewerDrawer', () => {
  it('renders nothing when isOpen=false', () => {
    render(
      <DocumentViewerDrawer isOpen={false} onClose={vi.fn()} githubUrl={GITHUB_URL} />
    )
    expect(screen.queryByTestId('document-viewer-drawer')).not.toBeInTheDocument()
  })

  it('shows loading state initially when opened', () => {
    // Never resolve so the loading state persists
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    render(
      <DocumentViewerDrawer isOpen={true} onClose={vi.fn()} githubUrl={GITHUB_URL} />
    )
    expect(screen.getByTestId('document-viewer-drawer')).toBeInTheDocument()
    expect(screen.getByTestId('drawer-loading')).toBeInTheDocument()
  })

  it('renders file content after fetch resolves', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: '# Hello\n\nThis is the document.' }),
    } as Response)

    render(
      <DocumentViewerDrawer isOpen={true} onClose={vi.fn()} githubUrl={GITHUB_URL} />
    )

    await waitFor(() => {
      expect(screen.getByTestId('drawer-content')).toBeInTheDocument()
    })
    // ReactMarkdown renders the heading as text
    expect(screen.getByTestId('drawer-content')).toHaveTextContent('Hello')
    expect(screen.queryByTestId('drawer-loading')).not.toBeInTheDocument()
    expect(screen.queryByTestId('drawer-error')).not.toBeInTheDocument()
  })

  it('shows error state when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'server error' }),
    } as Response)

    render(
      <DocumentViewerDrawer isOpen={true} onClose={vi.fn()} githubUrl={GITHUB_URL} />
    )

    await waitFor(() => {
      expect(screen.getByTestId('drawer-error')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('drawer-loading')).not.toBeInTheDocument()
    expect(screen.queryByTestId('drawer-content')).not.toBeInTheDocument()
    // Error state has fallback "Open in GitHub" link
    expect(screen.getByTestId('drawer-error')).toHaveTextContent('Open in GitHub')
  })

  it('calls onClose when ✕ button is clicked', async () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const onClose = vi.fn()
    render(
      <DocumentViewerDrawer isOpen={true} onClose={onClose} githubUrl={GITHUB_URL} />
    )
    fireEvent.click(screen.getByTestId('drawer-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape key is pressed', async () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const onClose = vi.fn()
    render(
      <DocumentViewerDrawer isOpen={true} onClose={onClose} githubUrl={GITHUB_URL} />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', async () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const onClose = vi.fn()
    render(
      <DocumentViewerDrawer isOpen={true} onClose={onClose} githubUrl={GITHUB_URL} />
    )
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows "Open in GitHub" link in the header', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    render(
      <DocumentViewerDrawer isOpen={true} onClose={vi.fn()} githubUrl={GITHUB_URL} />
    )
    const link = screen.getByTestId('open-in-github')
    expect(link).toHaveAttribute('href', GITHUB_URL)
    expect(link).toHaveAttribute('target', '_blank')
  })
})
