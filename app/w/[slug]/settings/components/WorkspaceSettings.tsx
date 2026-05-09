'use client'

import { useState } from 'react'
import type { Workspace } from '@/lib/supabase/types'

interface Props {
  workspace: Workspace
  onUpdated: (workspace: Workspace) => void
}

const WORKING_STYLES = [
  { value: 'hands-off', label: 'Hands-off', description: 'Bots work independently and only surface decisions that need you' },
  { value: 'balanced', label: 'Balanced', description: 'Bots check in on key decisions but handle the rest autonomously' },
  { value: 'hands-on', label: 'Hands-on', description: 'Bots ask for your input at each step before taking action' },
] as const

export function WorkspaceSettings({ workspace, onUpdated }: Props) {
  const [name, setName] = useState(workspace.name)
  const [workingStyle, setWorkingStyle] = useState<Workspace['working_style']>(workspace.working_style)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setLoading(true)
    setError(null)
    setSaved(false)
    const res = await fetch('/api/workspace/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), workingStyle }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not save changes. Try again.')
      return
    }
    const { workspace: updated } = await res.json()
    onUpdated(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const isDirty = name.trim() !== workspace.name || workingStyle !== workspace.working_style

  return (
    <div>
      <h2 className="text-sm font-semibold mb-4" style={{ color: '#d1d2d3' }}>Workspace</h2>

      <div className="space-y-6">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#868686' }}>
            Workspace name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            className="w-full px-3 py-2 rounded text-sm outline-none"
            style={{ backgroundColor: '#27292d', color: '#d1d2d3', border: '1px solid #3d3f43' }}
            data-testid="workspace-name-input"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: '#868686' }}>
            Working style
          </label>
          <div className="space-y-2">
            {WORKING_STYLES.map((style) => (
              <button
                key={style.value}
                onClick={() => setWorkingStyle(style.value)}
                className="w-full text-left px-4 py-3 rounded-lg"
                style={{
                  backgroundColor: '#27292d',
                  border: `1px solid ${workingStyle === style.value ? '#1164a3' : '#27292d'}`,
                }}
                data-testid={`style-option-${style.value}`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center"
                    style={{ borderColor: workingStyle === style.value ? '#1164a3' : '#868686' }}
                  >
                    {workingStyle === style.value && (
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#1164a3' }} />
                    )}
                  </div>
                  <span className="text-sm font-medium" style={{ color: '#d1d2d3' }}>{style.label}</span>
                </div>
                <p className="text-xs mt-1 ml-5" style={{ color: '#868686' }}>{style.description}</p>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-xs" style={{ color: '#e05252' }} data-testid="workspace-error">{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={loading || !isDirty || !name.trim()}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{
            backgroundColor: isDirty && name.trim() ? '#1164a3' : '#27292d',
            color: isDirty && name.trim() ? '#fff' : '#868686',
          }}
          data-testid="workspace-save"
        >
          {loading ? 'Saving…' : saved ? 'Saved!' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
