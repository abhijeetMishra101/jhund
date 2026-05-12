'use client'

import Link from 'next/link'
import type { ChannelWithMembers, PresenceStatus } from '@/lib/supabase/types'
import { ActionCounter } from './ActionCounter'
import { BotAvatar } from './BotAvatar'
import { usePresence } from './PresenceContext'

interface Props {
  workspaceName: string
  workspaceSlug: string
  channels: ChannelWithMembers[]
  activeChannelId: string
  actionsUsed: number
  actionCap: number
  onSelect: (id: string) => void
  onOpenDm?: (botRoleId: string, roleKey: string) => void
}

function MemberAvatarRow({ members }: { members: ChannelWithMembers['members'] }) {
  const { presenceMap } = usePresence()
  const visible = members.slice(0, 3)
  const overflow = members.length - visible.length

  return (
    <span className="flex items-center gap-0.5 ml-1">
      {visible.map((m) => (
        <BotAvatar
          key={m.bot_role_id}
          seed={m.avatar_seed}
          displayName={m.display_name}
          size="sm"
          status={presenceMap[m.bot_role_id] ?? m.status}
        />
      ))}
      {overflow > 0 && (
        <span className="text-[10px] ml-0.5" style={{ color: '#868686' }}>+{overflow}</span>
      )}
    </span>
  )
}

export function ChannelSidebar({
  workspaceName,
  workspaceSlug,
  channels,
  activeChannelId,
  actionsUsed,
  actionCap,
  onSelect,
  onOpenDm,
}: Props) {
  const { presenceMap } = usePresence()

  const regularChannels = channels.filter((c) => c.channel_type !== 'dm')
  const dmChannels = channels.filter((c) => c.channel_type === 'dm')

  // Collect unique bots across all channels for the DM section
  // Show all bots from non-DM channels as DM-able contacts
  const allMembers = regularChannels.flatMap((c) => c.members)
  const seenBotIds = new Set<string>()
  const uniqueBots = allMembers.filter((m) => {
    if (seenBotIds.has(m.bot_role_id)) return false
    seenBotIds.add(m.bot_role_id)
    return true
  })

  return (
    <aside className="w-60 shrink-0 flex flex-col" style={{ backgroundColor: '#1a1d21' }}>
      <div className="px-4 py-3 border-b border-white/10">
        <h1 className="text-sm font-bold text-white truncate">{workspaceName}</h1>
        <p className="text-xs mt-0.5" style={{ color: '#868686' }}>Your team</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {/* CHANNELS section */}
        <p
          className="px-4 text-xs font-semibold uppercase tracking-wider mb-1"
          style={{ color: '#868686' }}
          data-testid="channels-section-label"
        >
          Channels
        </p>
        <ul data-testid="channels-list">
          {regularChannels.map((ch) => {
            const isActive = activeChannelId === ch.id
            return (
              <li key={ch.id}>
                <button
                  onClick={() => onSelect(ch.id)}
                  data-testid={`channel-${ch.id}`}
                  aria-current={isActive ? 'page' : undefined}
                  className="w-full text-left px-4 py-1.5 text-sm transition-colors rounded mx-0 flex items-center"
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
                  <span className="flex-1 truncate"># {ch.display_name}</span>
                  {ch.members.length > 0 && (
                    <MemberAvatarRow members={ch.members} />
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        {/* DIRECT MESSAGES section */}
        {(uniqueBots.length > 0 || dmChannels.length > 0) && (
          <>
            <p
              className="px-4 text-xs font-semibold uppercase tracking-wider mt-4 mb-1"
              style={{ color: '#868686' }}
              data-testid="dms-section-label"
            >
              Direct Messages
            </p>
            <ul data-testid="dms-list">
              {uniqueBots.map((bot) => {
                // Find the DM channel for this bot if it already exists
                const existingDm = dmChannels.find((c) =>
                  c.members.some((m) => m.bot_role_id === bot.bot_role_id)
                )
                const isActive = existingDm ? activeChannelId === existingDm.id : false
                const liveStatus: PresenceStatus = presenceMap[bot.bot_role_id] ?? bot.status

                return (
                  <li key={bot.bot_role_id}>
                    <button
                      onClick={() => {
                        if (existingDm) {
                          onSelect(existingDm.id)
                        } else {
                          onOpenDm?.(bot.bot_role_id, bot.role_key)
                        }
                      }}
                      data-testid={`dm-${bot.bot_role_id}`}
                      aria-current={isActive ? 'page' : undefined}
                      className="w-full text-left px-4 py-1.5 text-sm transition-colors rounded mx-0 flex items-center gap-2"
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
                      <BotAvatar
                        seed={bot.avatar_seed}
                        displayName={bot.display_name}
                        size="sm"
                        status={liveStatus}
                      />
                      <span className="truncate">{bot.display_name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </nav>

      <ActionCounter used={actionsUsed} cap={actionCap} />

      <div className="px-4 py-3 border-t" style={{ borderColor: '#27292d' }}>
        <Link
          href={`/w/${workspaceSlug}/settings`}
          className="text-xs flex items-center gap-1.5"
          style={{ color: '#868686' }}
          data-testid="settings-link"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </Link>
      </div>
    </aside>
  )
}
