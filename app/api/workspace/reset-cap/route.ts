import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createServiceClient()

  const { data: userRow } = await serviceClient
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()

  if (!userRow?.workspace_id) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const { data: workspace, error } = await serviceClient
    .from('workspaces')
    .update({ actions_used: 0 })
    .eq('id', userRow.workspace_id)
    .select('actions_used, action_cap')
    .single()

  if (error || !workspace) {
    return NextResponse.json({ error: 'Failed to reset counter' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    actions_used: workspace.actions_used,
    action_cap: workspace.action_cap,
  })
}
