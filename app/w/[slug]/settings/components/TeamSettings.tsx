'use client'

import { useState } from 'react'
import type { BotRole, Channel, Workspace } from '@/lib/supabase/types'
import { HIREABLE_ROLE_KEYS, getRoleLabel } from '@/lib/templates/roles'
import { HireModal } from './HireModal'

interface Props {
  workspace: Workspace
  botRoles: BotRole[]
  channels: Channel[]
  onBotHired: (bot: BotRole, channel: Channel) => void
  onBotFired: (botId: string) => void
  onBotRenamed: (bot: BotRole) => void
}

export function TeamSettings({ workspace, botRoles, channels, onBotHired, onBotFired, onBotRenamed }: Props) {
  const [showHireModal, setShowHireModal] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [loading, setLoading] = useState<string | null>(null)

  const hiredRoleKeys = new Set(botRoles.map((b) => b.role_key))
  const availableRoleKeys = HIREABLE_ROLE_KEYS.filter((k) => !hiredRoleKeys.has(k))

  const handleFire = async (bot: BotRole) => {
    if (!confirm(`Remove ${bot.display_name} from the team?`)) return
    setLoading(bot.id)
    const res = await fetch(`/api/workspace/bots/${bot.id}`, { method: 'DELETE' })
    setLoading(null)
    if (res.ok) onBotFired(bot.id)
  }

  const startRename = (bot: BotRole) => {
    setRenamingId(bot.id)
    setRenameValue(bot.display_name)
  }

  const handleRename = async (botId: string) => {
    if (!renameValue.trim()) return
    setLoading(botId)
    const res = await fetch(`/api/workspace/bots/${botId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: renameValue.trim() }),
    })
    setLoading(null)
    if (res.ok) {
      const { bot } = await res.json()
      onBotRenamed(bot)
    }
    setRenamingId(null)
  }

  const displayedBots = botRoles.filter((b) => {
    const ch = channels.find((c) => c.bot_role_id === b.id)
    return b.role_key === 'ops' || ch
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: '#d1d2d3' }}>Your team</h2>
        {availableRoleKeys.length > 0 && (
          <button
            onClick={() => setShowHireModal(true)}
            className="text-sm px-3 py-1.5 rounded font-medium"
            style={{ backgroundColor: '#1164a3', color: '#fff' }}
            data-testid="hire-button"
          >
            + Hire teammate
          </button>
        )}
      </div>

      <div className="space-y-2">
        {displayedBots.map((bot) => (
          <div
            key={bot.id}
            className="flex items-center gap-3 px-4 py-3 rounded-lg"
            style={{ backgroundColor: '#27292d' }}
            data-testid={`bot-row-${bot.id}`}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: '#1164a3', color: '#fff' }}
            >
              {bot.display_name[0].toUpperCase()}
            </div>

            {renamingId === bot.id ? (
              <input
                className="flex-1 bg-transparent text-sm outline-none border-b"
                style={{ color: '#d1d2d3', borderColor: '#1164a3' }}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(bot.id)
                  if (e.key === 'Escape') setRenamingId(null)
                }}
                autoFocus
                data-testid={`rename-input-${bot.id}`}
              />
            ) : (
              <div className="flex-1">
                <span className="text-sm font-medium" style={{ color: '#d1d2d3' }}>{bot.display_name}</span>
                <span className="text-xs ml-2" style={{ color: '#868686' }}>{getRoleLabel(bot.role_key)}</span>
              </div>
            )}

            <div className="flex gap-2">
              {renamingId === bot.id ? (
                <>
                  <button
                    onClick={() => handleRename(bot.id)}
                    disabled={loading === bot.id}
                    className="text-xs px-2 py-1 rounded"
                    style={{ backgroundColor: '#1164a3', color: '#fff' }}
                    data-testid={`rename-save-${bot.id}`}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setRenamingId(null)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: '#868686' }}
                    data-testid={`rename-cancel-${bot.id}`}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => startRename(bot)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: '#868686' }}
                    data-testid={`rename-button-${bot.id}`}
                  >
                    Rename
                  </button>
                  {bot.role_key !== 'ops' && (
                    <button
                      onClick={() => handleFire(bot)}
                      disabled={loading === bot.id}
                      className="text-xs px-2 py-1 rounded"
                      style={{ color: '#e05252' }}
                      data-testid={`fire-button-${bot.id}`}
                    >
                      {loading === bot.id ? '…' : 'Remove'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {showHireModal && (
        <HireModal
          workspace={workspace}
          availableRoleKeys={availableRoleKeys}
          onHired={(bot, channel) => {
            onBotHired(bot, channel)
            setShowHireModal(false)
          }}
          onClose={() => setShowHireModal(false)}
        />
      )}
    </div>
  )
}
