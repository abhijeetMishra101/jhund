'use client'

import { useState } from 'react'
import type { MessageWithThread } from '@/lib/supabase/types'
import type { PlanStatus } from './types'
import { PlanCard } from './PlanCard'
import { BotAvatar } from './BotAvatar'

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

export function MessageBubble({ message, botRole, onPlanAction, onOpenThread }: Props) {
  const [showFullTime, setShowFullTime] = useState(false)
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

  return (
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

        {/* Message text — flat, no bubble */}
        <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap mt-0.5">
          {message.content}
        </p>

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
  )
}
