'use client'

import type { Message } from '@/lib/supabase/types'
import type { PlanStatus } from './types'
import { PlanCard } from './PlanCard'

interface Props {
  message: Message
  botRole?: { display_name: string }
  onPlanAction: (planId: string, status: PlanStatus) => void
}

export function MessageBubble({ message, botRole, onPlanAction }: Props) {
  const isUser = message.author_type === 'user'
  const isSystem = message.author_type === 'system'

  if (isSystem) {
    return (
      <div className="text-xs text-center text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mx-auto max-w-md">
        {message.content}
      </div>
    )
  }

  const botName = botRole?.display_name ?? 'Bot'
  const botInitial = botName.charAt(0).toUpperCase()

  return (
    <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white mb-1"
          style={{ backgroundColor: '#4f46e5' }}
          title={botName}
        >
          {botInitial}
        </div>
      )}

      <div className="flex flex-col gap-0.5 max-w-[70%]">
        <span className={`text-[11px] font-medium px-1 ${isUser ? 'text-right text-gray-400' : 'text-gray-500'}`}>
          {isUser ? 'You' : botName}
        </span>
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
