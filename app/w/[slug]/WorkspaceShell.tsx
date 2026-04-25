'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Workspace, Channel, Message } from '@/lib/supabase/types'

type PlanStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'

interface PlanSummary {
  id: string
  status: PlanStatus
  description_md: string
}

const POLL_INTERVAL_MS = 3000

interface BotRoleSummary {
  id: string
  display_name: string
  avatar_seed: string
}

interface Props {
  workspace: Workspace
  channels: Channel[]
  botRoles: BotRoleSummary[]
}

export default function WorkspaceShell({ workspace, channels, botRoles }: Props) {
  const botRoleMap = Object.fromEntries(botRoles.map((b) => [b.id, b]))
  const [activeChannelId, setActiveChannelId] = useState<string>(channels[0]?.id ?? '')
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [actionsUsed, setActionsUsed] = useState(workspace.actions_used)
  const [waitingForBot, setWaitingForBot] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const actionCap = workspace.action_cap
  const pctUsed = Math.round((actionsUsed / actionCap) * 100)

  const activeChannel = channels.find((c) => c.id === activeChannelId)

  // Fetch messages when active channel changes
  const fetchMessages = useCallback(async (channelId: string) => {
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/messages/${channelId}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data)
      }
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  useEffect(() => {
    if (!activeChannelId) return
    setMessages([])
    setWaitingForBot(false)
    fetchMessages(activeChannelId)
  }, [activeChannelId, fetchMessages])

  // Supabase Realtime — subscribe to new messages in the active channel
  useEffect(() => {
    if (!activeChannelId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`messages:${activeChannelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${activeChannelId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message
          setMessages((prev) => {
            // Deduplicate by id (optimistic insert already added it)
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          // If it's a bot message, stop poll + refresh counter
          if (newMsg.author_type === 'bot') {
            setWaitingForBot(false)
            setActionsUsed((n) => Math.min(n + 1, actionCap))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeChannelId, actionCap])

  // Background poll — refreshes the active channel every 5s to catch
  // webhook-triggered messages that arrive without user interaction.
  useEffect(() => {
    if (!activeChannelId) return
    const interval = setInterval(() => {
      fetch(`/api/messages/${activeChannelId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setMessages(data) })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [activeChannelId])

  // Polling fallback — kicks in after user sends a message, stops on bot reply.
  // Handles environments where Supabase Realtime isn't fully configured.
  useEffect(() => {
    if (!waitingForBot || !activeChannelId) return

    const poll = async () => {
      const res = await fetch(`/api/messages/${activeChannelId}`)
      if (!res.ok) return
      const data: Message[] = await res.json()
      const lastMsg = data[data.length - 1]
      if (lastMsg?.author_type === 'bot') {
        setMessages(data)
        setWaitingForBot(false)
        setActionsUsed((n) => Math.min(n + 1, actionCap))
      }
    }

    pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [waitingForBot, activeChannelId, actionCap])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    const content = inputValue.trim()
    if (!content || sending) return

    setSending(true)
    setInputValue('')

    // Optimistic insert
    const optimisticId = `optimistic-${Date.now()}`
    const optimistic: Message = {
      id: optimisticId,
      channel_id: activeChannelId,
      author_type: 'user',
      author_id: '',
      content,
      plan_id: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: activeChannelId, content }),
      })

      if (res.status === 402) {
        // Action cap exceeded — remove optimistic, show system note
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticId),
          {
            id: `sys-${Date.now()}`,
            channel_id: activeChannelId,
            author_type: 'system',
            author_id: '',
            content: 'Your team has used all their actions for this period. Upgrade to continue.',
            plan_id: null,
            created_at: new Date().toISOString(),
          },
        ])
        return
      }

      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        return
      }

      const { id: realId } = await res.json()
      // Replace optimistic with real id, then start polling for bot reply
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, id: realId } : m))
      )
      setWaitingForBot(true)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col" style={{ backgroundColor: '#1a1d21' }}>
        {/* Workspace name */}
        <div className="px-4 py-3 border-b border-white/10">
          <h1 className="text-sm font-bold text-white truncate">{workspace.name}</h1>
          <p className="text-xs mt-0.5" style={{ color: '#868686' }}>Your team</p>
        </div>

        {/* Channel list */}
        <nav className="flex-1 overflow-y-auto py-3">
          <p className="px-4 text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#868686' }}>
            Channels
          </p>
          <ul>
            {channels.map((ch) => (
              <li key={ch.id}>
                <button
                  onClick={() => setActiveChannelId(ch.id)}
                  className="w-full text-left px-4 py-1.5 text-sm transition-colors rounded mx-0"
                  style={{
                    backgroundColor: activeChannelId === ch.id ? '#1164a3' : 'transparent',
                    color: activeChannelId === ch.id ? '#ffffff' : '#d1d2d3',
                  }}
                  onMouseEnter={(e) => {
                    if (activeChannelId !== ch.id) e.currentTarget.style.backgroundColor = '#27292d'
                  }}
                  onMouseLeave={(e) => {
                    if (activeChannelId !== ch.id) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  # {ch.display_name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Action counter */}
        <div className="px-4 py-3 border-t border-white/10">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs" style={{ color: '#868686' }}>Actions used</span>
            <span className="text-xs font-medium" style={{ color: pctUsed >= 80 ? '#e8a838' : '#868686' }}>
              {actionsUsed} / {actionCap}
            </span>
          </div>
          <div className="h-1 rounded-full" style={{ backgroundColor: '#27292d' }}>
            <div
              className="h-1 rounded-full transition-all"
              style={{ width: `${pctUsed}%`, backgroundColor: pctUsed >= 80 ? '#e8a838' : '#1164a3' }}
            />
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 shrink-0 border-b border-gray-200 bg-white flex items-center px-4 gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            # {activeChannel?.display_name ?? ''}
          </h2>
          <div className="flex-1" />
          <span
            className="text-xs font-medium px-2 py-1 rounded"
            style={{
              backgroundColor: pctUsed >= 80 ? '#fef3c7' : '#f3f4f6',
              color: pctUsed >= 80 ? '#92400e' : '#6b7280',
            }}
          >
            {actionsUsed} / {actionCap} actions used
          </span>
        </header>

        {/* Message thread */}
        <main className="flex-1 overflow-y-auto bg-white px-4 py-4">
          {loadingMessages ? (
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
                  onPlanAction={(_planId, _status) => {
                    // Re-fetch messages after approve/reject so new bot message appears
                    fetchMessages(activeChannelId)
                  }}
                />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </main>

        {/* Message input */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
          <div className="flex items-end gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white focus-within:border-indigo-500 transition-colors">
            <textarea
              ref={inputRef}
              rows={1}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${activeChannel?.display_name ?? ''}…`}
              className="flex-1 resize-none text-sm text-gray-900 placeholder-gray-400 bg-transparent outline-none leading-5"
              style={{ maxHeight: '120px' }}
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={!inputValue.trim() || sending}
              className="shrink-0 px-3 py-1 text-sm font-medium rounded text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  )
}

function PlanCard({
  planId,
  onAction,
}: {
  planId: string
  onAction: (planId: string, status: PlanStatus) => void
}) {
  const [plan, setPlan] = useState<PlanSummary | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/plans/${planId}`)
      .then((r) => {
        if (!r.ok) {
          console.error('[PlanCard] fetch failed:', r.status, planId)
          return null
        }
        return r.json()
      })
      .then((data) => {
        console.log('[PlanCard] fetched plan:', data)
        if (data) setPlan(data)
      })
      .catch((err) => console.error('[PlanCard] fetch error:', err))
  }, [planId])

  if (!plan) {
    return (
      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-600">
        Loading action…
      </div>
    )
  }

  const handleApprove = async () => {
    setLoading(true)
    await fetch(`/api/plans/${planId}/approve`, { method: 'POST' })
    onAction(planId, 'approved')
    setPlan((p) => p ? { ...p, status: 'approved' } : p)
    setLoading(false)
  }

  const handleReject = async () => {
    setLoading(true)
    await fetch(`/api/plans/${planId}/reject`, { method: 'POST' })
    onAction(planId, 'rejected')
    setPlan((p) => p ? { ...p, status: 'rejected' } : p)
    setLoading(false)
  }

  const isPending = plan.status === 'pending'

  const statusColors: Record<PlanStatus, string> = {
    pending: 'bg-amber-50 border-amber-300',
    approved: 'bg-green-50 border-green-300',
    rejected: 'bg-gray-50 border-gray-300',
    executed: 'bg-blue-50 border-blue-300',
    failed: 'bg-red-50 border-red-300',
  }

  const statusLabels: Record<PlanStatus, string> = {
    pending: 'Waiting for your approval',
    approved: 'Approved — running…',
    rejected: 'Rejected',
    executed: 'Done',
    failed: 'Failed',
  }

  return (
    <div className={`mt-2 rounded-xl border p-3 text-sm ${statusColors[plan.status]}`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        Proposed action
      </p>
      <p className="text-gray-800 mb-2">{plan.description_md}</p>
      {isPending ? (
        <div className="flex gap-2">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="px-3 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={handleReject}
            disabled={loading}
            className="px-3 py-1 text-xs font-medium rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Reject
          </button>
        </div>
      ) : (
        <span className="text-xs text-gray-500 font-medium">{statusLabels[plan.status]}</span>
      )}
    </div>
  )
}

function MessageBubble({
  message,
  botRole,
  onPlanAction,
}: {
  message: Message
  botRole?: { display_name: string }
  onPlanAction: (planId: string, status: PlanStatus) => void
}) {
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
      {/* Bot avatar — left side only */}
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
        {/* Sender label */}
        <span className={`text-[11px] font-medium px-1 ${isUser ? 'text-right text-gray-400' : 'text-gray-500'}`}>
          {isUser ? 'You' : botName}
        </span>
        {/* Bubble */}
        <div
          className={`px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-indigo-600 text-white rounded-2xl rounded-br-sm'
              : 'bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm'
          }`}
        >
          {message.content}
        </div>
        {/* Plan approval card — shown below bot message when plan_id is set */}
        {message.plan_id && !isUser && (
          <PlanCard planId={message.plan_id} onAction={onPlanAction} />
        )}
      </div>

      {/* User avatar — right side only */}
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
