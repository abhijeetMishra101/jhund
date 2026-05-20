import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

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

  // Anti-IDOR: verify feature belongs to user's workspace
  const { data: feature, error: featureError } = await db
    .from('features')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', userRow.workspace_id)
    .single()

  if (featureError || !feature) {
    return NextResponse.json({ error: 'Feature not found' }, { status: 404 })
  }

  const { data: use_cases } = await db
    .from('feature_use_cases')
    .select('*')
    .eq('feature_id', id)
    .order('created_at', { ascending: true })

  const { data: gate_history } = await db
    .from('gate_events')
    .select('*')
    .eq('feature_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    feature,
    use_cases: use_cases ?? [],
    gate_history: gate_history ?? [],
  })
}
