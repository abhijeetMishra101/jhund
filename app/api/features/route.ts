import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()

  const { data: userRow } = await db
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()

  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: features, error } = await db
    .from('features')
    .select('id, title, stage, status, complexity, blocking_reason, updated_at')
    .eq('workspace_id', userRow.workspace_id)
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch features' }, { status: 500 })
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

  return NextResponse.json({ features: enriched })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { title, description, complexity } = body as Record<string, unknown>

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!description || typeof description !== 'string' || !description.trim()) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: userRow } = await db
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()

  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const validComplexity = (['hotfix', 'small', 'medium', 'large'] as const).includes(
    complexity as 'hotfix' | 'small' | 'medium' | 'large'
  )
    ? (complexity as 'hotfix' | 'small' | 'medium' | 'large')
    : 'medium'

  const { data: feature, error } = await db
    .from('features')
    .insert({
      workspace_id: userRow.workspace_id,
      title: title.trim(),
      description: description.trim(),
      complexity: validComplexity,
      stage: 1,
      status: 'active' as const,
    })
    .select('id, stage')
    .single()

  if (error || !feature) {
    return NextResponse.json({ error: 'Failed to create feature' }, { status: 500 })
  }

  return NextResponse.json({ id: feature.id, stage: 1 }, { status: 201 })
}
