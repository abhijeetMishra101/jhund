'use client'

import { useState } from 'react'
import type { BotRole, Channel, Workspace } from '@/lib/supabase/types'
import { ROLE_CATALOG, getRoleLabel } from '@/lib/templates/roles'

interface Props {
  workspace: Workspace
  availableRoleKeys: string[]
  onHired: (bot: BotRole, channel: Channel) => void
  onClose: () => void
}

export function HireModal({ workspace, availableRoleKeys, onHired, onClose }: Props) {
  const [selectedKey, setSelectedKey] = useState(availableRoleKeys[0] ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleHire = async () => {
    if (!selectedKey) return
    setLoading(true)
    setError(null)
    const res = await fetch('/api/workspace/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleKey: selectedKey }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Something went wrong. Try again.')
      return
    }
    const { bot, channel } = await res.json()
    onHired(bot, channel)
  }

  const selectedRole = selectedKey ? ROLE_CATALOG[selectedKey] : null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-xl p-6"
        style={{ backgroundColor: '#1a1d21', border: '1px solid #27292d' }}
        data-testid="hire-modal"
      >
        <h2 className="text-base font-semibold mb-4" style={{ color: '#d1d2d3' }}>
          Hire a teammate
        </h2>

        <div className="space-y-2 mb-4">
          {availableRoleKeys.map((key) => (
            <button
              key={key}
              onClick={() => setSelectedKey(key)}
              className="w-full text-left px-4 py-3 rounded-lg flex items-center gap-3"
              style={{
                backgroundColor: selectedKey === key ? '#27292d' : 'transparent',
                border: `1px solid ${selectedKey === key ? '#1164a3' : '#27292d'}`,
              }}
              data-testid={`role-option-${key}`}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: '#1164a3', color: '#fff' }}
              >
                {getRoleLabel(key)[0].toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: '#d1d2d3' }}>
                  {getRoleLabel(key)}
                </div>
                {selectedKey === key && selectedRole && (
                  <div className="text-xs mt-0.5" style={{ color: '#868686' }}>
                    {selectedRole.domain}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {error && (
          <p className="text-xs mb-3" style={{ color: '#e05252' }} data-testid="hire-error">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm"
            style={{ color: '#868686' }}
            data-testid="hire-cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleHire}
            disabled={loading || !selectedKey}
            className="px-4 py-2 rounded text-sm font-medium"
            style={{ backgroundColor: '#1164a3', color: '#fff', opacity: loading ? 0.6 : 1 }}
            data-testid="hire-confirm"
          >
            {loading ? 'Hiring…' : 'Hire'}
          </button>
        </div>
      </div>
    </div>
  )
}
