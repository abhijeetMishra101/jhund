'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Workspace, Channel, Message } from '@/lib/supabase/types'

interface Props {
  workspace: Workspace
  channels: Channel[]
}

export default function WorkspaceShell({ workspace, channels }: Props) {
  const [activeChannelId, setActiveChannelId] = useState<string>(channels[0]?.id ?? '')
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [actionsUsed, setActionsUsed] = useState(workspace.actions_used)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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
          // If it's a bot message, refresh action counter
          if (newMsg.author_type === 'bot') {
            setActionsUsed((n) => Math.min(n + 1, actionCap))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeChannelId, actionCap])

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
      // Replace optimistic with real id
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, id: realId } : m))
      )
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
            <div className="max-w-2xl space-y-4">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
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

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.author_type === 'user'
  const isSystem = message.author_type === 'system'

  if (isSystem) {
    return (
      <div className="text-xs text-center text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        {message.content}
      </div>
    )
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
        style={{ backgroundColor: isUser ? '#1164a3' : '#4f46e5' }}
      >
        {isUser ? 'You' : 'AI'}
      </div>
      {/* Bubble */}
      <div
        className={`max-w-sm px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-indigo-600 text-white rounded-tr-sm'
            : 'bg-gray-100 text-gray-900 rounded-tl-sm'
        }`}
      >
        {message.content}
      </div>
    </div>
  )
}
