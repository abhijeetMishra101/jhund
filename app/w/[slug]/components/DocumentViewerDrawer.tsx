'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'

export interface DocumentViewerDrawerProps {
  isOpen: boolean
  onClose: () => void
  githubUrl: string
}

export function DocumentViewerDrawer({ isOpen, onClose, githubUrl }: DocumentViewerDrawerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // Fetch file content when drawer opens or URL changes
  useEffect(() => {
    if (!isOpen || !githubUrl) return
    setContent(null)
    setError(false)
    setLoading(true)
    fetch(`/api/github/file-content?url=${encodeURIComponent(githubUrl)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('fetch failed')
        const data: { content: string } = await res.json()
        setContent(data.content)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [isOpen, githubUrl])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        data-testid="drawer-backdrop"
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="fixed top-0 right-0 h-full w-full md:w-2/5 bg-white shadow-2xl z-50 flex flex-col"
        style={{ animation: 'slideInRight 0.2s ease-out' }}
        data-testid="document-viewer-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Document viewer"
      >
        {/* Header */}
        <div className="h-12 shrink-0 border-b border-gray-200 flex items-center px-4 gap-2">
          <h3 className="text-sm font-semibold text-gray-900 flex-1">
            📄 Discussion
          </h3>
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-600 hover:underline shrink-0"
            data-testid="open-in-github"
          >
            Open in GitHub ↗
          </a>
          <button
            onClick={onClose}
            aria-label="Close document viewer"
            className="text-gray-400 hover:text-gray-700 transition-colors"
            data-testid="drawer-close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center h-full" data-testid="drawer-loading">
              <div className="text-sm text-gray-400">Loading…</div>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3" data-testid="drawer-error">
              <p className="text-sm text-gray-500">Could not load document.</p>
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-600 hover:underline"
              >
                Open in GitHub ↗
              </a>
            </div>
          )}

          {content !== null && !loading && !error && (
            <div
              className="prose prose-sm max-w-none text-gray-900"
              data-testid="drawer-content"
            >
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  )
}
