export type PlanStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'

export interface PlanSummary {
  id: string
  status: PlanStatus
  description_md: string
}
