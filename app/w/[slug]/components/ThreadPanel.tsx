'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MessageWithThread } from '@/lib/supabase/types'
import type { PlanStatus } from './types'
import { BotAvatar } from './BotAvatar'
import { MessageInput } from './MessageInput'

interface BotRoleSummary {
  id: string
  display_name: string
  avatar_seed: string
}

interface Props {
  parentMessage: MessageWithThread
  channelId: string
  botRoleMap: Record<string, BotRoleSummary>
  onClose: () => void
  onPlanAction: (planId: string, status: PlanStatus) => void
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

export function ThreadPanel({ parentMessage, channelId, botRoleMap, onClose, onPlanAction }: Props) {
  const [replies, setReplies] = useState<MessageWithThread[]>([])
  const [loading, setLoading] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const parentBot = botRoleMap[parentMessage.author_id]

  // Fetch replies
  useEffect(() => {
    setLoading(true)
    fetch(`/api/messages/${channelId}/threads/${parentMessage.id}`)
      .then((r) => r.ok ? r.json() : { replies: [] })
      .then((data: { replies: MessageWithThread[] }) => {
        setReplies(data.replies ?? [])
      })
      .catch(() => setReplies([]))
      .finally(() => setLoading(false))
  }, [channelId, parentMessage.id])

  // Supabase Realtime for new thread replies
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`thread:${parentMessage.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${channelId}`,
      }, (payload) => {
        const newMsg = payload.new as MessageWithThread
        if (newMsg.parent_id === parentMessage.id) {
          setReplies((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg])
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [channelId, parentMessage.id])

  // Scroll to bottom on new reply
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [replies])

  const sendReply = async () => {
    const content = inputValue.trim()
    if (!content || sending) return
    setSending(true)
    setInputValue('')

    const optimisticId = `optimistic-${Date.now()}`
    const optimistic: MessageWithThread = {
      id: optimisticId,
      channel_id: channelId,
      author_type: 'user',
      author_id: '',
      content,
      plan_id: null,
      created_at: new Date().toISOString(),
      parent_id: parentMessage.id,
      reply_count: 0,
    }
    setReplies((prev) => [...prev, optimistic])

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, content, parent_id: parentMessage.id }),
      })
      if (res.ok) {
        const { id: realId } = await res.json()
        setReplies((prev) =>
          prev.map((m) => m.id === optimisticId ? { ...m, id: realId } : m)
        )
      } else {
        setReplies((prev) => prev.filter((m) => m.id !== optimisticId))
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="w-[360px] shrink-0 flex flex-col border-l border-gray-200 bg-white overflow-hidden"
      style={{ animation: 'slideInRight 0.2s ease-out' }}
      data-testid="thread-panel"
    >
      {/* Header */}
      <div className="h-12 shrink-0 border-b border-gray-200 flex items-center px-4 gap-2">
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Thread</h3>
        <button
          onClick={onClose}
          aria-label="Close thread"
          className="text-gray-400 hover:text-gray-700 transition-colors"
          data-testid="thread-close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Parent message */}
        <div className="pb-4 border-b border-gray-100" data-testid="thread-parent">
          <div className="flex items-start gap-2 mb-1">
            {parentMessage.author_type === 'bot' && parentBot && (
              <BotAvatar seed={parentBot.avatar_seed} displayName={parentBot.display_name} size="md" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-gray-800">
                  {parentMessage.author_type === 'user' ? 'You' : (parentBot?.display_name ?? 'Bot')}
                </span>
                <span className="text-[10px] text-gray-400">
                  {isOlderThanToday(parentMessage.created_at)
                    ? formatFull(parentMessage.created_at)
                    : formatTime(parentMessage.created_at)}
                </span>
              </div>
              <p className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">{parentMessage.content}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1 pl-[40px]">
            {parentMessage.reply_count} {parentMessage.reply_count === 1 ? 'reply' : 'replies'}
          </p>
        </div>

        {/* Replies */}
        {loading ? (
          <p className="text-xs text-gray-400 text-center py-4">Loading replies…</p>
        ) : replies.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No replies yet. Start the thread.</p>
        ) : (
          <div className="space-y-3">
            {replies.map((reply) => {
              const replyBot = botRoleMap[reply.author_id]
              return (
                <div key={reply.id} className="flex items-start gap-2" data-testid={`thread-reply-${reply.id}`}>
                  {reply.author_type === 'bot' && replyBot && (
                    <BotAvatar seed={replyBot.avatar_seed} displayName={replyBot.display_name} size="sm" />
                  )}
                  {reply.author_type === 'user' && (
                    <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] text-white font-bold">
                      You
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-gray-800">
                        {reply.author_type === 'user' ? 'You' : (replyBot?.display_name ?? 'Bot')}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {isOlderThanToday(reply.created_at)
                          ? formatFull(reply.created_at)
                          : formatTime(reply.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">{reply.content}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Reply input */}
      <div className="shrink-0">
        <MessageInput
          channelName="thread"
          value={inputValue}
          onChange={setInputValue}
          onSend={sendReply}
          sending={sending}
        />
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}
