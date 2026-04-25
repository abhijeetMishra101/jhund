'use client'

import type { Message } from '@/lib/supabase/types'
import type { PlanStatus } from './types'
import { MessageBubble } from './MessageBubble'

interface BotRoleSummary {
  id: string
  display_name: string
}

interface Props {
  messages: Message[]
  loading: boolean
  botRoleMap: Record<string, BotRoleSummary>
  onPlanAction: (planId: string, status: PlanStatus) => void
  bottomRef: React.RefObject<HTMLDivElement>
}

export function MessageThread({ messages, loading, botRoleMap, onPlanAction, bottomRef }: Props) {
  return (
    <main className="flex-1 overflow-y-auto bg-white px-4 py-4">
      {loading ? (
        <p className="text-sm text-gray-400 text-center mt-16">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-gray-400 text-center mt-16">
          No messages yet. Say something to your teammate.
        </p>
      ) : (
        <div className="w-full space-y-3">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              botRole={botRoleMap[msg.author_id]}
              onPlanAction={onPlanAction}
            />
          ))}
        </div>
      )}
      <div ref={bottomRef} />
    </main>
  )
}
