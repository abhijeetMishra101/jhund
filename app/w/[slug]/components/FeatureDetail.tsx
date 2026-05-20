'use client'

import { useEffect, useState } from 'react'
import type { Feature, FeatureUseCase, GateEvent } from '@/lib/supabase/types'

const STAGE_NAMES: Record<number, string> = {
  1: 'Idea',
  2: 'Requirements',
  3: 'Design',
  4: 'Architecture',
  5: 'Build',
  6: 'QA',
  7: 'Shipped',
}

interface DetailResponse {
  feature: Feature
  use_cases: FeatureUseCase[]
  gate_history: GateEvent[]
}

interface Props {
  featureId: string
}

export function FeatureDetail({ featureId }: Props) {
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/features/${featureId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load feature')
        return res.json() as Promise<DetailResponse>
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [featureId])

  if (loading) {
    return (
      <div className="p-4" style={{ color: '#868686' }}>
        <p className="text-xs">Loading…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-4" style={{ color: '#fca5a5' }}>
        <p className="text-xs">Could not load feature details.</p>
      </div>
    )
  }

  const { feature, use_cases, gate_history } = data
  const stageName = STAGE_NAMES[feature.stage] ?? `Stage ${feature.stage}`

  return (
    <div className="p-4 space-y-4" data-testid="feature-detail">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-white">{feature.title}</h3>
        <p className="text-xs mt-1" style={{ color: '#868686' }}>
          {feature.description}
        </p>
        <p className="text-xs mt-1" style={{ color: '#868686' }}>
          Stage: <span className="text-white">{stageName}</span>
          {' · '}
          Status: <span className="text-white capitalize">{feature.status}</span>
        </p>
      </div>

      {/* Blocked warning */}
      {feature.status === 'blocked' && feature.blocking_reason && (
        <div
          className="rounded p-3 text-xs"
          style={{ backgroundColor: '#7f1d1d20', border: '1px solid #7f1d1d', color: '#fca5a5' }}
          data-testid="blocked-reason"
        >
          ⚠ Blocked: {feature.blocking_reason}
        </div>
      )}

      {/* Use cases */}
      {use_cases.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#868686' }}>
            Use Cases
          </p>
          <ul className="space-y-1">
            {use_cases.map((uc) => (
              <li key={uc.id} className="flex items-start gap-2 text-xs text-white">
                <span className="shrink-0 mt-0.5">
                  {uc.verified_at ? (
                    <span style={{ color: '#86efac' }}>✓</span>
                  ) : uc.waived_at ? (
                    <span style={{ color: '#868686' }}>—</span>
                  ) : (
                    <span style={{ color: '#3d4045' }}>○</span>
                  )}
                </span>
                <span>
                  {uc.uc_id}: {uc.description}
                  {uc.waived_at && (
                    <span className="ml-1" style={{ color: '#868686' }}>
                      (Waived{uc.waive_reason ? `: ${uc.waive_reason}` : ''})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Gate history */}
      {gate_history.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#868686' }}>
            History
          </p>
          <ul className="space-y-1">
            {gate_history.map((g) => (
              <li key={g.id} className="text-xs" style={{ color: '#868686' }}>
                <span className="text-white">
                  {STAGE_NAMES[g.from_stage] ?? `Stage ${g.from_stage}`}
                  {' → '}
                  {STAGE_NAMES[g.to_stage] ?? `Stage ${g.to_stage}`}
                </span>
                {g.actor_role && <span className="ml-1">by {g.actor_role}</span>}
                {g.notes && <span className="ml-1">· {g.notes}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
