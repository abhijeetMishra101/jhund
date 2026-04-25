'use client'

import type { Channel } from '@/lib/supabase/types'
import { ActionCounter } from './ActionCounter'

interface Props {
  workspaceName: string
  channels: Channel[]
  activeChannelId: string
  actionsUsed: number
  actionCap: number
  onSelect: (id: string) => void
}

export function ChannelSidebar({
  workspaceName,
  channels,
  activeChannelId,
  actionsUsed,
  actionCap,
  onSelect,
}: Props) {
  return (
    <aside className="w-60 shrink-0 flex flex-col" style={{ backgroundColor: '#1a1d21' }}>
      <div className="px-4 py-3 border-b border-white/10">
        <h1 className="text-sm font-bold text-white truncate">{workspaceName}</h1>
        <p className="text-xs mt-0.5" style={{ color: '#868686' }}>Your team</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        <p
          className="px-4 text-xs font-semibold uppercase tracking-wider mb-1"
          style={{ color: '#868686' }}
        >
          Channels
        </p>
        <ul>
          {channels.map((ch) => {
            const isActive = activeChannelId === ch.id
            return (
              <li key={ch.id}>
                <button
                  onClick={() => onSelect(ch.id)}
                  data-testid={`channel-${ch.id}`}
                  aria-current={isActive ? 'page' : undefined}
                  className="w-full text-left px-4 py-1.5 text-sm transition-colors rounded mx-0"
                  style={{
                    backgroundColor: isActive ? '#1164a3' : 'transparent',
                    color: isActive ? '#ffffff' : '#d1d2d3',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = '#27292d'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  # {ch.display_name}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <ActionCounter used={actionsUsed} cap={actionCap} />
    </aside>
  )
}
