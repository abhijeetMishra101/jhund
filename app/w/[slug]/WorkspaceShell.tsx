'use client'

import { useState } from 'react'
import type { Workspace, Channel } from '@/lib/supabase/types'

interface Props {
  workspace: Workspace
  channels: Channel[]
}

export default function WorkspaceShell({ workspace, channels }: Props) {
  const [activeChannelId, setActiveChannelId] = useState<string>(channels[0]?.id ?? '')

  const activeChannel = channels.find((c) => c.id === activeChannelId)
  const actionsUsed = workspace.actions_used
  const actionCap = workspace.action_cap
  const pctUsed = Math.round((actionsUsed / actionCap) * 100)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className="w-60 shrink-0 flex flex-col"
        style={{ backgroundColor: '#1a1d21' }}
      >
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
            {channels.map((channel) => (
              <li key={channel.id}>
                <button
                  onClick={() => setActiveChannelId(channel.id)}
                  className="w-full text-left px-4 py-1.5 text-sm transition-colors rounded mx-0"
                  style={{
                    backgroundColor: activeChannelId === channel.id ? '#1164a3' : 'transparent',
                    color: activeChannelId === channel.id ? '#ffffff' : '#d1d2d3',
                  }}
                  onMouseEnter={(e) => {
                    if (activeChannelId !== channel.id) {
                      e.currentTarget.style.backgroundColor = '#27292d'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeChannelId !== channel.id) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  {channel.display_name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Action counter */}
        <div className="px-4 py-3 border-t border-white/10">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs" style={{ color: '#868686' }}>⚡ Actions used</span>
            <span
              className="text-xs font-medium"
              style={{ color: pctUsed >= 80 ? '#e8a838' : '#868686' }}
            >
              {actionsUsed} / {actionCap}
            </span>
          </div>
          <div className="h-1 rounded-full" style={{ backgroundColor: '#27292d' }}>
            <div
              className="h-1 rounded-full transition-all"
              style={{
                width: `${pctUsed}%`,
                backgroundColor: pctUsed >= 80 ? '#e8a838' : '#1164a3',
              }}
            />
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 shrink-0 border-b border-gray-200 bg-white flex items-center px-4 gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {activeChannel?.display_name ?? ''}
          </h2>
          <div className="flex-1" />
          {/* Action counter in topbar */}
          <span
            className="text-xs font-medium px-2 py-1 rounded"
            style={{
              backgroundColor: pctUsed >= 80 ? '#fef3c7' : '#f3f4f6',
              color: pctUsed >= 80 ? '#92400e' : '#6b7280',
            }}
          >
            ⚡ {actionsUsed} / {actionCap} actions used
          </span>
        </header>

        {/* Canvas */}
        <main className="flex-1 overflow-y-auto bg-white p-6">
          <div className="max-w-2xl">
            <p className="text-sm text-gray-400 text-center mt-16">
              No messages yet. Say something to your teammate.
            </p>
          </div>
        </main>

        {/* Message input placeholder */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-gray-50">
            <span className="text-sm text-gray-400 flex-1">
              Message {activeChannel?.display_name ?? ''}… (coming in Session 3)
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
