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

  const { data: decisions, error } = await db
    .from('decision_events')
    .select('id, title, summary, action, action_dispatched_at, channel_id, bot_role_id, created_at')
    .eq('workspace_id', userRow.workspace_id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch decisions' }, { status: 500 })
  }

  return NextResponse.json({ decisions: decisions ?? [] })
}
