'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Workspace, Channel, Message } from '@/lib/supabase/types'
import type { PlanStatus } from './components/types'
import { ChannelSidebar } from './components/ChannelSidebar'
import { MessageThread } from './components/MessageThread'
import { MessageInput } from './components/MessageInput'

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const actionCap = workspace.action_cap
  const activeChannel = channels.find((c) => c.id === activeChannelId)

  const fetchMessages = useCallback(async (channelId: string) => {
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/messages/${channelId}`)
      if (res.ok) setMessages(await res.json())
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

  // Supabase Realtime — new messages pushed to active channel
  useEffect(() => {
    if (!activeChannelId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`messages:${activeChannelId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `channel_id=eq.${activeChannelId}`,
      }, (payload) => {
        const newMsg = payload.new as Message
        setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg])
        if (newMsg.author_type === 'bot') {
          setWaitingForBot(false)
          setActionsUsed((n) => Math.min(n + 1, actionCap))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeChannelId, actionCap])

  // Background refresh every 5 s — catches webhook-triggered messages
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

  // Polling fallback after user sends — stops on first bot reply
  useEffect(() => {
    if (!waitingForBot || !activeChannelId) return
    const poll = async () => {
      const res = await fetch(`/api/messages/${activeChannelId}`)
      if (!res.ok) return
      const data: Message[] = await res.json()
      const last = data[data.length - 1]
      if (last?.author_type === 'bot') {
        setMessages(data)
        setWaitingForBot(false)
        setActionsUsed((n) => Math.min(n + 1, actionCap))
      }
    }
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [waitingForBot, activeChannelId, actionCap])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    const content = inputValue.trim()
    if (!content || sending) return
    setSending(true)
    setInputValue('')

    const optimisticId = `optimistic-${Date.now()}`
    const optimistic: Message = {
      id: optimisticId, channel_id: activeChannelId,
      author_type: 'user', author_id: '', content, plan_id: null,
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
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticId),
          {
            id: `sys-${Date.now()}`, channel_id: activeChannelId,
            author_type: 'system', author_id: '',
            content: 'Your team has used all their actions for this period. Upgrade to continue.',
            plan_id: null, created_at: new Date().toISOString(),
          },
        ])
        return
      }

      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        return
      }

      const { id: realId } = await res.json()
      setMessages((prev) => prev.map((m) => m.id === optimisticId ? { ...m, id: realId } : m))
      setWaitingForBot(true)
    } finally {
      setSending(false)
    }
  }

  const pctUsed = Math.round((actionsUsed / actionCap) * 100)

  return (
    <div className="flex h-screen overflow-hidden">
      <ChannelSidebar
        workspaceName={workspace.name}
        channels={channels}
        activeChannelId={activeChannelId}
        actionsUsed={actionsUsed}
        actionCap={actionCap}
        onSelect={setActiveChannelId}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
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

        <MessageThread
          messages={messages}
          loading={loadingMessages}
          botRoleMap={botRoleMap}
          onPlanAction={(_planId: string, _status: PlanStatus) => fetchMessages(activeChannelId)}
          bottomRef={bottomRef}
        />

        <MessageInput
          channelName={activeChannel?.display_name ?? ''}
          value={inputValue}
          onChange={setInputValue}
          onSend={sendMessage}
          sending={sending}
        />
      </div>
    </div>
  )
}
