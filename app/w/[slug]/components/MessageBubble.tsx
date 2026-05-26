'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import type { MessageWithThread } from '@/lib/supabase/types'
import type { PlanStatus } from './types'
import { PlanCard } from './PlanCard'
import { BotAvatar } from './BotAvatar'
import { DocumentViewerDrawer } from './DocumentViewerDrawer'

interface BotRoleSummary {
  id: string
  display_name: string
  avatar_seed: string
}

interface Props {
  message: MessageWithThread
  botRole?: BotRoleSummary
  onPlanAction: (planId: string, status: PlanStatus) => void
  onOpenThread?: (message: MessageWithThread) => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatFull(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function isOlderThanToday(iso: string): boolean {
  const msgDate = new Date(iso)
  const today = new Date()
  return (
    msgDate.getFullYear() !== today.getFullYear() ||
    msgDate.getMonth() !== today.getMonth() ||
    msgDate.getDate() !== today.getDate()
  )
}

const GITHUB_BLOB_RE = /^https:\/\/github\.com\/.+\/blob\/.+/

export function MessageBubble({ message, botRole, onPlanAction, onOpenThread }: Props) {
  const [showFullTime, setShowFullTime] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerUrl, setDrawerUrl] = useState('')
  const isUser = message.author_type === 'user'
  const isSystem = message.author_type === 'system'

  if (isSystem) {
    return (
      <div className="text-xs text-center text-gray-500 py-1 my-1" data-testid="system-message">
        {message.content}
      </div>
    )
  }

  const botName = botRole?.display_name ?? 'Bot'
  const avatarSeed = botRole?.avatar_seed ?? 'default'
  const replyCount = message.reply_count ?? 0

  /** Custom link renderer — intercepts GitHub blob URLs to open the drawer */
  const linkComponent: Components['a'] = ({ href, children }) => {
    if (href && GITHUB_BLOB_RE.test(href)) {
      return (
        <button
          type="button"
          onClick={() => {
            setDrawerUrl(href)
            setDrawerOpen(true)
          }}
          className="text-indigo-600 hover:underline cursor-pointer bg-transparent border-none p-0 font-inherit text-sm"
          data-testid="github-doc-link"
        >
          {children}
        </button>
      )
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
        {children}
      </a>
    )
  }

  /** Restrict to inline elements only — no headings, lists, or block elements */
  const markdownComponents: Components = {
    a: linkComponent,
    // Strip headings — render as bold text instead
    h1: ({ children }) => <strong>{children}</strong>,
    h2: ({ children }) => <strong>{children}</strong>,
    h3: ({ children }) => <strong>{children}</strong>,
    h4: ({ children }) => <strong>{children}</strong>,
    h5: ({ children }) => <strong>{children}</strong>,
    h6: ({ children }) => <strong>{children}</strong>,
    // Strip list wrappers — render items inline with spacing
    ul: ({ children }) => <span className="inline">{children}</span>,
    ol: ({ children }) => <span className="inline">{children}</span>,
    li: ({ children }) => <span className="inline">{children} </span>,
    // Strip block-level paragraph wrapper (keep inline flow)
    p: ({ children }) => <span>{children}</span>,
    // Preserve block code as pre — it's useful but contained
    pre: ({ children }) => (
      <pre className="inline bg-gray-100 rounded px-1 py-0.5 text-xs font-mono">{children}</pre>
    ),
  }

  return (
    <>
      <div
        className="group flex gap-3 px-4 py-1 hover:bg-gray-50 rounded-lg transition-colors"
        data-testid={`message-${message.id}`}
      >
        {/* Avatar column — fixed 36px, top-aligned */}
        <div className="shrink-0 w-9 pt-0.5">
          {isUser ? (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: '#1164a3' }}
            >
              You
            </div>
          ) : (
            <BotAvatar seed={avatarSeed} displayName={botName} size="md" />
          )}
        </div>

        {/* Content column */}
        <div className="flex-1 min-w-0">
          {/* Name + timestamp row */}
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {isUser ? 'You' : botName}
            </span>
            <span
              className="text-[11px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-default select-none"
              onMouseEnter={() => setShowFullTime(true)}
              onMouseLeave={() => setShowFullTime(false)}
              data-testid="message-timestamp"
            >
              {showFullTime && isOlderThanToday(message.created_at)
                ? formatFull(message.created_at)
                : formatTime(message.created_at)}
            </span>
          </div>

          {/* Message text — rendered via react-markdown (inline-only) */}
          <div className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap mt-0.5">
            <ReactMarkdown components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>

          {/* Plan card */}
          {message.plan_id && !isUser && (
            <PlanCard planId={message.plan_id} onAction={onPlanAction} />
          )}

          {/* Thread reply link — only visible on row hover */}
          {replyCount > 0 && (
            <button
              onClick={() => onOpenThread?.(message)}
              className="mt-1 text-xs text-indigo-600 hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
              data-testid="thread-link"
            >
              {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
      </div>

      <DocumentViewerDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        githubUrl={drawerUrl}
      />
    </>
  )
}
