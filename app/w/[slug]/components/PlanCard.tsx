'use client'

import { useState, useEffect } from 'react'
import type { PlanStatus, PlanSummary } from './types'

interface Props {
  planId: string
  onAction: (planId: string, status: PlanStatus) => void
}

export function PlanCard({ planId, onAction }: Props) {
  const [plan, setPlan] = useState<PlanSummary | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/plans/${planId}`)
      .then((r) => {
        if (!r.ok) {
          console.error('[PlanCard] fetch failed:', r.status, planId)
          return null
        }
        return r.json()
      })
      .then((data) => {
        if (data) setPlan(data)
      })
      .catch((err) => console.error('[PlanCard] fetch error:', err))
  }, [planId])

  if (!plan) {
    return (
      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-600">
        Loading action…
      </div>
    )
  }

  const handleApprove = async () => {
    setLoading(true)
    await fetch(`/api/plans/${planId}/approve`, { method: 'POST' })
    onAction(planId, 'approved')
    setPlan((p) => p ? { ...p, status: 'approved' } : p)
    setLoading(false)
  }

  const handleReject = async () => {
    setLoading(true)
    await fetch(`/api/plans/${planId}/reject`, { method: 'POST' })
    onAction(planId, 'rejected')
    setPlan((p) => p ? { ...p, status: 'rejected' } : p)
    setLoading(false)
  }

  const isPending = plan.status === 'pending'

  const statusColors: Record<PlanStatus, string> = {
    pending: 'bg-amber-50 border-amber-300',
    approved: 'bg-green-50 border-green-300',
    rejected: 'bg-gray-50 border-gray-300',
    executed: 'bg-blue-50 border-blue-300',
    failed: 'bg-red-50 border-red-300',
  }

  const statusLabels: Record<PlanStatus, string> = {
    pending: 'Waiting for your approval',
    approved: 'Approved — running…',
    rejected: 'Rejected',
    executed: 'Done',
    failed: 'Failed',
  }

  return (
    <div className={`mt-2 rounded-xl border p-3 text-sm ${statusColors[plan.status]}`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        Proposed action
      </p>
      <p className="text-gray-800 mb-2">{plan.description_md}</p>
      {isPending ? (
        <div className="flex gap-2">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="px-3 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={handleReject}
            disabled={loading}
            className="px-3 py-1 text-xs font-medium rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Reject
          </button>
        </div>
      ) : (
        <span className="text-xs text-gray-500 font-medium">{statusLabels[plan.status]}</span>
      )}
    </div>
  )
}
