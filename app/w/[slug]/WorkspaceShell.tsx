'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Workspace, MessageWithThread, ChannelWithMembers, Channel } from '@/lib/supabase/types'
import type { PlanStatus } from './components/types'
import { ChannelSidebar } from './components/ChannelSidebar'
import { MessageThread } from './components/MessageThread'
import { MessageInput } from './components/MessageInput'
import { ThreadPanel } from './components/ThreadPanel'
import { BotAvatar } from './components/BotAvatar'
import { PipelinePanel } from './components/PipelinePanel'
import { PresenceProvider, usePresence } from './components/PresenceContext'
import Link from 'next/link'

const POLL_INTERVAL_MS = 3000

interface BotRoleSummary {
  id: string
  display_name: string
  avatar_seed: string
}

interface Props {
  workspace: Workspace
  /** Accept plain Channel[] (from page.tsx) or ChannelWithMembers[] (from new API) */
  channels: Channel[] | ChannelWithMembers[]
  botRoles: BotRoleSummary[]
}

/** Coerce a Channel (or ChannelWithMembers) into a full ChannelWithMembers */
function normalizeChannel(ch: Channel | ChannelWithMembers): ChannelWithMembers {
  if ('channel_type' in ch && 'members' in ch) return ch as ChannelWithMembers
  return {
    ...(ch as Channel),
    channel_type: 'channel',
    members: [],
  }
}

function WorkspaceShellInner({ workspace, channels: rawChannels, botRoles }: Props) {
  const botRoleMap = Object.fromEntries(botRoles.map((b) => [b.id, b]))
  const normalizedChannels = rawChannels.map(normalizeChannel)
  const [activeChannelId, setActiveChannelId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`activeChannel:${workspace.id}`)
      if (stored && normalizedChannels.some((c) => c.id === stored)) return stored
    }
    return normalizedChannels[0]?.id ?? ''
  })
  const [messages, setMessages] = useState<MessageWithThread[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [actionsUsed, setActionsUsed] = useState(workspace.actions_used)
  const [waitingForBot, setWaitingForBot] = useState(false)
  const [threadMessage, setThreadMessage] = useState<MessageWithThread | null>(null)
  const [allChannels, setAllChannels] = useState<ChannelWithMembers[]>(normalizedChannels)
  const [showPipeline, setShowPipeline] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { markBotActive } = usePresence()

  const actionCap = workspace.action_cap
  const activeChannel = allChannels.find((c) => c.id === activeChannelId)

  const fetchMessages = useCallback(async (channelId: string, signal?: AbortSignal) => {
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/messages/${channelId}`, { signal })
      if (res.ok) {
        setMessages(await res.json())
      } else {
        // Surface the failure so it's visible in Vercel function logs
        console.error('[fetchMessages] API error %d for channel %s', res.status, channelId)
      }
    } catch (err) {
      // AbortError is expected on channel switch — swallow it silently
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('[fetchMessages] Network error for channel %s:', channelId, err)
      }
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  useEffect(() => {
    if (!activeChannelId) return
    const controller = new AbortController()
    setMessages([])
    setWaitingForBot(false)
    fetchMessages(activeChannelId, controller.signal)
    // Cancel any in-flight fetch when the channel changes so stale data
    // from a previous channel never overwrites the current channel's state.
    return () => controller.abort()
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
        const newMsg = payload.new as MessageWithThread
        setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg])
        if (newMsg.author_type === 'bot') {
          setWaitingForBot(false)
          if (newMsg.author_id) markBotActive(newMsg.author_id)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeChannelId, markBotActive])

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

  // Sync action counter from server every 10 s — reflects GitHub executions
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/workspace')
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data?.actionCounter) setActionsUsed(data.actionCounter.used) })
        .catch(() => {})
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  // Polling fallback after user sends — stops on first bot reply
  useEffect(() => {
    if (!waitingForBot || !activeChannelId) return
    const poll = async () => {
      const res = await fetch(`/api/messages/${activeChannelId}`)
      if (!res.ok) return
      const data: MessageWithThread[] = await res.json()
      const last = data[data.length - 1]
      if (last?.author_type === 'bot') {
        setMessages(data)
        setWaitingForBot(false)
      }
    }
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [waitingForBot, activeChannelId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    const content = inputValue.trim()
    if (!content || sending) return
    setSending(true)
    setInputValue('')

    const optimisticId = `optimistic-${Date.now()}`
    const optimistic: MessageWithThread = {
      id: optimisticId, channel_id: activeChannelId,
      author_type: 'user', author_id: '', content, plan_id: null,
      parent_id: null, reply_count: 0,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: activeChannelId, content }),
      })

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

  const resetActionCap = async () => {
    if (!confirm('Reset the action counter to zero?')) return
    const res = await fetch('/api/workspace/reset-cap', { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setActionsUsed(data.actions_used)
    }
  }

  /** Create or navigate to a DM channel for a given bot */
  const openDm = async (botRoleId: string, roleKey: string) => {
    const res = await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel_type: 'dm',
        bot_role_id: botRoleId,
        name: `dm-${roleKey}`,
      }),
    })
    if (res.ok || res.status === 409) {
      const data = await res.json()
      const newChannel: ChannelWithMembers = data
      // Add to local channel list if not already present
      setAllChannels((prev) =>
        prev.some((c) => c.id === newChannel.id) ? prev : [...prev, newChannel]
      )
      handleChannelSelect(newChannel.id)
    }
  }

  /** Persist the active channel across refreshes */
  const handleChannelSelect = useCallback((id: string) => {
    setActiveChannelId(id)
    setShowPipeline(false)
    if (typeof window !== 'undefined') {
      localStorage.setItem(`activeChannel:${workspace.id}`, id)
    }
  }, [workspace.id])

  const pctUsed = Math.round((actionsUsed / actionCap) * 100)

  // Active channel members (for header + input placeholder)
  const activeMembers = activeChannel?.members ?? []

  return (
    <div className="flex h-screen overflow-hidden">
      <ChannelSidebar
        workspaceName={workspace.name}
        workspaceSlug={workspace.slug}
        channels={allChannels}
        activeChannelId={activeChannelId}
        actionsUsed={actionsUsed}
        actionCap={actionCap}
        onSelect={handleChannelSelect}
        onOpenDm={openDm}
        onOpenPipeline={() => setShowPipeline(true)}
      />

      {showPipeline ? (
        <PipelinePanel />
      ) : null}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0" style={showPipeline ? { display: 'none' } : undefined}>
        <header className="h-12 shrink-0 border-b border-gray-200 bg-white flex items-center px-4 gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            # {activeChannel?.display_name ?? ''}
          </h2>

          {/* Member avatars in header */}
          {activeMembers.length > 0 && (
            <div className="flex items-center gap-2">
              {activeMembers.map((m) => (
                <div key={m.bot_role_id} className="flex items-center gap-1">
                  <BotAvatar
                    seed={m.avatar_seed}
                    displayName={m.display_name}
                    size="md"
                  />
                  <span className="text-xs text-gray-600">{m.display_name}</span>
                </div>
              ))}
              <Link
                href={`/w/${workspace.slug}/settings`}
                className="text-xs text-indigo-600 hover:underline ml-1"
              >
                + Add teammate
              </Link>
            </div>
          )}

          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-medium px-2 py-1 rounded"
              style={{
                backgroundColor: pctUsed >= 80 ? '#fef3c7' : '#f3f4f6',
                color: pctUsed >= 80 ? '#92400e' : '#6b7280',
              }}
              data-testid="reset-cap-button"
            >
              {actionsUsed} / {actionCap} actions used
            </span>
          </div>
        </header>

        <MessageThread
          messages={messages}
          loading={loadingMessages}
          botRoleMap={botRoleMap}
          onPlanAction={(_planId: string, _status: PlanStatus) => fetchMessages(activeChannelId)}
          onOpenThread={setThreadMessage}
          bottomRef={bottomRef}
        />

        {/* Action cap warning banner — shown at ≥80% usage */}
        {pctUsed >= 80 && (
          <div
            className="shrink-0 mx-4 mb-2 rounded-lg px-4 py-2.5 text-sm flex items-start justify-between gap-4"
            style={{
              backgroundColor: pctUsed >= 100 ? '#fef2f2' : '#fffbeb',
              border: `1px solid ${pctUsed >= 100 ? '#fca5a5' : '#fcd34d'}`,
            }}
            data-testid="action-cap-banner"
          >
            <span style={{ color: pctUsed >= 100 ? '#991b1b' : '#92400e' }}>
              {pctUsed >= 100
                ? `🔒 Your team has used all ${actionCap} actions this month. They can still answer questions, but can't take GitHub actions until you reset.`
                : `⚠ Your team is running low — ${actionsUsed}/${actionCap} actions used. They can still chat, but GitHub actions are limited.`}
            </span>
            <button
              onClick={resetActionCap}
              className="shrink-0 text-xs font-medium underline whitespace-nowrap"
              style={{ color: pctUsed >= 100 ? '#991b1b' : '#92400e' }}
              data-testid="action-cap-banner-reset"
            >
              Reset
            </button>
          </div>
        )}

        <MessageInput
          channelName={activeChannel?.display_name ?? ''}
          value={inputValue}
          onChange={setInputValue}
          onSend={sendMessage}
          sending={sending}
          channelMembers={activeMembers}
          allBotRoles={botRoles}
        />
      </div>

      {/* Thread panel — slides in from right (hidden when pipeline is open) */}
      {!showPipeline && threadMessage && activeChannelId && (
        <ThreadPanel
          parentMessage={threadMessage}
          channelId={activeChannelId}
          botRoleMap={botRoleMap}
          onClose={() => setThreadMessage(null)}
          onPlanAction={(_planId: string, _status: PlanStatus) => fetchMessages(activeChannelId)}
        />
      )}
    </div>
  )
}

export default function WorkspaceShell(props: Props) {
  // Build initial presence map from channel members (only if channels are enriched)
  const initial: Record<string, import('@/lib/supabase/types').PresenceStatus> = {}
  for (const ch of props.channels) {
    const members = 'members' in ch ? (ch as ChannelWithMembers).members : []
    for (const m of members) {
      initial[m.bot_role_id] = m.status
    }
  }
  return (
    <PresenceProvider initial={initial}>
      <WorkspaceShellInner {...props} />
    </PresenceProvider>
  )
}
