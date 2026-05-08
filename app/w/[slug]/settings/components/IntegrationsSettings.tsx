'use client'

import type { GithubInstallation, Workspace } from '@/lib/supabase/types'

interface Props {
  workspace: Workspace
  installation: GithubInstallation | null
}

export function IntegrationsSettings({ workspace, installation }: Props) {
  return (
    <div>
      <h2 className="text-sm font-semibold mb-4" style={{ color: '#d1d2d3' }}>Integrations</h2>

      <div
        className="rounded-lg px-4 py-4"
        style={{ backgroundColor: '#27292d' }}
        data-testid="github-integration-card"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#1a1d21' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#d1d2d3">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium" style={{ color: '#d1d2d3' }}>GitHub</div>
              {installation ? (
                <div className="text-xs" style={{ color: '#868686' }}>
                  Connected · {installation.repo_full_name !== 'pending' ? installation.repo_full_name : 'All repositories'}
                </div>
              ) : (
                <div className="text-xs" style={{ color: '#868686' }}>Not connected</div>
              )}
            </div>
          </div>

          {installation ? (
            <span
              className="text-xs px-2 py-1 rounded-full font-medium"
              style={{ backgroundColor: '#1a472a', color: '#4ade80' }}
              data-testid="github-connected-badge"
            >
              Connected
            </span>
          ) : (
            <a
              href="/api/github/connect"
              className="text-sm px-3 py-1.5 rounded font-medium"
              style={{ backgroundColor: '#1164a3', color: '#fff' }}
              data-testid="github-connect-button"
            >
              Connect
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
