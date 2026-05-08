'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Workspace, BotRole, Channel, GithubInstallation } from '@/lib/supabase/types'
import { TeamSettings } from './components/TeamSettings'
import { IntegrationsSettings } from './components/IntegrationsSettings'
import { WorkspaceSettings } from './components/WorkspaceSettings'

type Tab = 'team' | 'integrations' | 'workspace'

interface Props {
  workspace: Workspace
  botRoles: BotRole[]
  channels: Channel[]
  installation: GithubInstallation | null
}

export default function SettingsShell({ workspace, botRoles, channels, installation }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('team')
  const [currentBotRoles, setCurrentBotRoles] = useState(botRoles)
  const [currentChannels, setCurrentChannels] = useState(channels)
  const [currentWorkspace, setCurrentWorkspace] = useState(workspace)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'team', label: 'Team' },
    { key: 'integrations', label: 'Integrations' },
    { key: 'workspace', label: 'Workspace' },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#1a1d21' }}>
      <header className="h-14 flex items-center px-6 border-b" style={{ borderColor: '#27292d' }}>
        <Link
          href={`/w/${workspace.slug}`}
          className="text-sm mr-6"
          style={{ color: '#868686' }}
          data-testid="back-to-workspace"
        >
          ← Back
        </Link>
        <h1 className="text-sm font-semibold" style={{ color: '#d1d2d3' }}>Settings</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <nav className="flex gap-1 mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              data-testid={`tab-${tab.key}`}
              className="px-4 py-2 rounded text-sm font-medium"
              style={{
                backgroundColor: activeTab === tab.key ? '#27292d' : 'transparent',
                color: activeTab === tab.key ? '#d1d2d3' : '#868686',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'team' && (
          <TeamSettings
            workspace={currentWorkspace}
            botRoles={currentBotRoles}
            channels={currentChannels}
            onBotHired={(bot, channel) => {
              setCurrentBotRoles((prev) => [...prev, bot])
              setCurrentChannels((prev) => [...prev, channel])
            }}
            onBotFired={(botId) => {
              setCurrentBotRoles((prev) => prev.filter((b) => b.id !== botId))
              setCurrentChannels((prev) => prev.filter((c) => c.bot_role_id !== botId))
            }}
            onBotRenamed={(bot) => {
              setCurrentBotRoles((prev) => prev.map((b) => b.id === bot.id ? bot : b))
            }}
          />
        )}

        {activeTab === 'integrations' && (
          <IntegrationsSettings workspace={currentWorkspace} installation={installation} />
        )}

        {activeTab === 'workspace' && (
          <WorkspaceSettings
            workspace={currentWorkspace}
            onUpdated={(updated) => setCurrentWorkspace(updated)}
          />
        )}
      </div>
    </div>
  )
}
