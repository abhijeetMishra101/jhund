'use client'

import { useEffect, useState } from 'react'
import { PipelineView } from './PipelineView'
import type { Feature } from '@/lib/supabase/types'

type EnrichedFeature = Feature & { use_case_count?: number; verified_count?: number }

export function PipelinePanel() {
  const [features, setFeatures] = useState<EnrichedFeature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/features')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json() as { features: EnrichedFeature[] }
        return data.features
      })
      .then(setFeatures)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: '#868686' }}>
        <p className="text-sm">Loading pipeline…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: '#fca5a5' }}>
        <p className="text-sm">Could not load pipeline. Please try again.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-8" data-testid="pipeline-panel">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-xl font-semibold text-white mb-6">Pipeline</h2>
        <PipelineView features={features} />
      </div>
    </div>
  )
}
