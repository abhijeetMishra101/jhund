import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const VALID_STYLES = ['hands-off', 'balanced', 'hands-on'] as const
const BOT_CONTEXT_MAX_CHARS = 3200

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { name?: string; workingStyle?: string; botContext?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, workingStyle, botContext } = body

  if (!name && !workingStyle && botContext === undefined) {
    return NextResponse.json({ error: 'At least one field (name, workingStyle, botContext) is required' }, { status: 400 })
  }

  if (name !== undefined && (!name.trim() || name.trim().length > 64)) {
    return NextResponse.json({ error: 'name must be 1–64 characters' }, { status: 400 })
  }

  if (workingStyle !== undefined && !VALID_STYLES.includes(workingStyle as typeof VALID_STYLES[number])) {
    return NextResponse.json({ error: 'workingStyle must be hands-off, balanced, or hands-on' }, { status: 400 })
  }

  if (botContext !== undefined && botContext.trim().length > BOT_CONTEXT_MAX_CHARS) {
    return NextResponse.json({ error: `Project description must be under ${BOT_CONTEXT_MAX_CHARS} characters` }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: userRow } = await service.from('users').select('workspace_id').eq('id', user.id).single()
  if (!userRow?.workspace_id) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  const updates: { name?: string; working_style?: typeof VALID_STYLES[number]; bot_context?: string | null } = {}
  if (name) updates.name = name.trim()
  if (workingStyle) updates.working_style = workingStyle as typeof VALID_STYLES[number]
  if (botContext !== undefined) updates.bot_context = botContext.trim() || null

  const { data: workspace, error } = await service.from('workspaces')
    .update(updates).eq('id', userRow.workspace_id).select().single()

  if (error || !workspace) return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 })

  return NextResponse.json({ workspace })
}
