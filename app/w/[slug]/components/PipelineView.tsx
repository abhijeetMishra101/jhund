'use client'

import { useState } from 'react'
import type { Feature } from '@/lib/supabase/types'
import { FeatureDetail } from './FeatureDetail'

const STAGE_NAMES: Record<number, string> = {
  1: 'Idea',
  2: 'Requirements',
  3: 'Design',
  4: 'Architecture',
  5: 'Build',
  6: 'QA',
  7: 'Shipped',
}

const STAGE_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: '#3d3d3d', text: '#c4c4c4' },
  2: { bg: '#1e3a5f', text: '#90cdf4' },
  3: { bg: '#3b1f6b', text: '#c084fc' },
  4: { bg: '#7a3010', text: '#fb923c' },
  5: { bg: '#4a3800', text: '#fbbf24' },
  6: { bg: '#0f3d3d', text: '#2dd4bf' },
  7: { bg: '#14532d', text: '#86efac' },
}

interface EnrichedFeature extends Feature {
  use_case_count?: number
  verified_count?: number
}

interface Props {
  features: EnrichedFeature[]
}

function StagePill({ stage }: { stage: number }) {
  const colors = STAGE_COLORS[stage] ?? { bg: '#3d3d3d', text: '#c4c4c4' }
  const label = STAGE_NAMES[stage] ?? `Stage ${stage}`
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: colors.bg, color: colors.text }}
      data-testid={`stage-pill-${stage}`}
    >
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: Feature['status'] }) {
  if (status === 'blocked') {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ml-2"
        style={{ backgroundColor: '#7f1d1d', color: '#fca5a5' }}
        data-testid="status-blocked"
      >
        Blocked
      </span>
    )
  }
  if (status === 'shipped') {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ml-2"
        style={{ backgroundColor: '#14532d', color: '#86efac' }}
        data-testid="status-shipped"
      >
        Shipped
      </span>
    )
  }
  return null
}

export function PipelineView({ features }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (features.length === 0) {
    return (
      <div
        className="text-center py-16"
        style={{ color: '#868686' }}
        data-testid="pipeline-empty"
      >
        <p className="text-sm">No features yet. Ask Alex to add one.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="pipeline-view">
      {features.map((f) => (
        <div key={f.id}>
          <button
            className="w-full text-left rounded-lg p-4 transition-colors"
            style={{ backgroundColor: '#222529', border: '1px solid #2d2f33' }}
            onClick={() => setSelectedId(selectedId === f.id ? null : f.id)}
            data-testid={`feature-card-${f.id}`}
            /* c8 ignore next */
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3d4045')}
            /* c8 ignore next */
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2d2f33')}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{f.title}</p>
                {f.use_case_count !== undefined && f.use_case_count > 0 && (
                  <p className="text-xs mt-1" style={{ color: '#868686' }}>
                    {f.use_case_count} use {f.use_case_count === 1 ? 'case' : 'cases'}
                    {f.verified_count !== undefined && f.verified_count > 0 && (
                      <span> · {f.verified_count} verified</span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center shrink-0">
                <StagePill stage={f.stage} />
                <StatusBadge status={f.status} />
              </div>
            </div>
            {f.status === 'blocked' && f.blocking_reason && (
              <p className="text-xs mt-2" style={{ color: '#fca5a5' }}>
                ⚠ {f.blocking_reason}
              </p>
            )}
          </button>

          {selectedId === f.id && (
            <div
              className="mt-1 rounded-lg overflow-hidden"
              style={{ backgroundColor: '#1a1d21', border: '1px solid #2d2f33' }}
            >
              <FeatureDetail featureId={f.id} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
