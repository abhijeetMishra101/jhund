import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const VALID_STYLES = ['hands-off', 'balanced', 'hands-on'] as const

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { name?: string; workingStyle?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, workingStyle } = body

  if (!name && !workingStyle) {
    return NextResponse.json({ error: 'At least one field (name, workingStyle) is required' }, { status: 400 })
  }

  if (name !== undefined && (!name.trim() || name.trim().length > 64)) {
    return NextResponse.json({ error: 'name must be 1–64 characters' }, { status: 400 })
  }

  if (workingStyle !== undefined && !VALID_STYLES.includes(workingStyle as typeof VALID_STYLES[number])) {
    return NextResponse.json({ error: 'workingStyle must be hands-off, balanced, or hands-on' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: userRow } = await service.from('users').select('workspace_id').eq('id', user.id).single()
  if (!userRow?.workspace_id) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  const updates: { name?: string; working_style?: typeof VALID_STYLES[number] } = {}
  if (name) updates.name = name.trim()
  if (workingStyle) updates.working_style = workingStyle as typeof VALID_STYLES[number]

  const { data: workspace, error } = await service.from('workspaces')
    .update(updates).eq('id', userRow.workspace_id).select().single()

  if (error || !workspace) return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 })

  return NextResponse.json({ workspace })
}
