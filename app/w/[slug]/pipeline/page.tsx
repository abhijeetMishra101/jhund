import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { PipelineView } from '../components/PipelineView'
import type { Feature } from '@/lib/supabase/types'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PipelinePage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const db = createServiceClient()

  const { data: userRow } = await db
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()

  if (!userRow) redirect('/onboarding')

  const { data: workspace } = await db
    .from('workspaces')
    .select('slug')
    .eq('id', userRow.workspace_id)
    .single()

  if (!workspace || workspace.slug !== slug) redirect('/auth/login')

  const { data: features, error } = await db
    .from('features')
    .select('id, title, stage, status, complexity, blocking_reason, updated_at')
    .eq('workspace_id', userRow.workspace_id)
    .order('updated_at', { ascending: false })

  if (error) {
    return (
      <main className="flex-1 p-8">
        <p className="text-sm" style={{ color: '#868686' }}>
          Could not load pipeline. Please try again.
        </p>
      </main>
    )
  }

  // Enrich with use case counts
  const enriched = await Promise.all(
    (features ?? []).map(async (f) => {
      const { count: ucCount } = await db
        .from('feature_use_cases')
        .select('id', { count: 'exact', head: true })
        .eq('feature_id', f.id)
      const { count: verifiedCount } = await db
        .from('feature_use_cases')
        .select('id', { count: 'exact', head: true })
        .eq('feature_id', f.id)
        .not('verified_at', 'is', null)
      return {
        ...f,
        use_case_count: ucCount ?? 0,
        verified_count: verifiedCount ?? 0,
      }
    })
  )

  return (
    <main className="flex-1 overflow-y-auto p-8" data-testid="pipeline-page">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-xl font-semibold text-white mb-6">Pipeline</h2>
        <PipelineView features={enriched as unknown as Feature[]} />
      </div>
    </main>
  )
}
