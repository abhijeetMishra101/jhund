'use client'

import { useState, useEffect, useRef } from 'react'
import type { ChannelMember } from '@/lib/supabase/types'

interface AvailableBot {
  id: string
  display_name: string
  avatar_seed: string
  role_key: string
  status: string
}

interface Props {
  channelId: string
  channelName: string
  onMemberAdded: (member: ChannelMember) => void
}

export function AddBotToChannelButton({ channelId, channelName, onMemberAdded }: Props) {
  const [open, setOpen] = useState(false)
  const [bots, setBots] = useState<AvailableBot[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const openDropdown = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    setLoading(true)
    try {
      const res = await fetch(`/api/channels/${channelId}/available-bots`)
      if (res.ok) {
        const data = await res.json()
        setBots(data.bots ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  const addBot = async (bot: AvailableBot) => {
    if (adding) return
    setAdding(bot.id)
    try {
      const res = await fetch(`/api/channels/${channelId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_role_id: bot.id }),
      })
      if (res.ok) {
        const data = await res.json()
        onMemberAdded(data.member)
        // Remove from available list optimistically
        setBots((prev) => prev.filter((b) => b.id !== bot.id))
        // Close if no more bots available
        setBots((prev) => {
          if (prev.length === 0) setOpen(false)
          return prev
        })
      }
    } finally {
      setAdding(null)
    }
  }

  // Strip "# " prefix from display_name for the header copy
  const cleanChannelName = channelName.replace(/^#\s*/, '')

  return (
    <div ref={containerRef} className="relative ml-1">
      <button
        onClick={openDropdown}
        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        data-testid="add-bot-button"
      >
        + Add
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
          data-testid="add-bot-dropdown"
        >
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Add to #{cleanChannelName}
            </p>
          </div>

          {loading ? (
            <div className="px-3 py-3 text-xs text-gray-400">Loading teammates…</div>
          ) : bots.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400">All teammates are already here.</div>
          ) : (
            <ul className="py-1 max-h-48 overflow-y-auto">
              {bots.map((bot) => (
                <li key={bot.id}>
                  <button
                    onClick={() => addBot(bot)}
                    disabled={adding === bot.id}
                    className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-indigo-50 flex items-center gap-2 disabled:opacity-50"
                    data-testid={`add-bot-option-${bot.id}`}
                  >
                    <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                      {bot.display_name[0]}
                    </span>
                    <span>{bot.display_name}</span>
                    {adding === bot.id && (
                      <span className="ml-auto text-xs text-gray-400">Adding…</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
