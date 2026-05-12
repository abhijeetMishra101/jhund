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
      className={`flex items-end gap-2 group ${isUser ? 'justify-end' : 'justify-start'}`}
      data-testid={`message-${message.id}`}
    >
      {!isUser && (
        <BotAvatar seed={avatarSeed} displayName={botName} size="md" />
      )}

      <div className="flex flex-col gap-0.5 max-w-[70%]">
        <div className="flex items-baseline gap-2">
          <span className={`text-[11px] font-medium px-1 ${isUser ? 'text-right text-gray-400' : 'text-gray-500'}`}>
            {isUser ? 'You' : botName}
          </span>
          <span
            className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-default select-none"
            onMouseEnter={() => setShowFullTime(true)}
            onMouseLeave={() => setShowFullTime(false)}
            data-testid="message-timestamp"
          >
            {showFullTime && isOlderThanToday(message.created_at)
              ? formatFull(message.created_at)
              : formatTime(message.created_at)}
          </span>
        </div>
        <div
          className={`px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-indigo-600 text-white rounded-2xl rounded-br-sm'
              : 'bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm'
          }`}
        >
          {message.content}
        </div>
        {message.plan_id && !isUser && (
          <PlanCard planId={message.plan_id} onAction={onPlanAction} />
        )}
        {replyCount > 0 && (
          <button
            onClick={() => onOpenThread?.(message)}
            className="mt-1 text-left text-xs text-indigo-600 hover:underline flex items-center gap-1"
            data-testid="thread-link"
          >
            <span>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
          </button>
        )}
      </div>

      {isUser && (
        <div
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white mb-1"
          style={{ backgroundColor: '#1164a3' }}
        >
          You
        </div>
      )}
    </div>
  )
}
