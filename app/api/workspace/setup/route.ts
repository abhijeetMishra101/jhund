import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createWorkspace, slugify, type WorkspaceTemplate, type WorkingStyle } from '@/lib/auth'

interface SetupBody {
  name: string
  template: WorkspaceTemplate
  workingStyle: WorkingStyle
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: SetupBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, template, workingStyle } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const validTemplates: WorkspaceTemplate[] = ['startup', 'enterprise', 'blank']
  if (!validTemplates.includes(template)) {
    return NextResponse.json({ error: 'invalid template' }, { status: 400 })
  }

  const validStyles: WorkingStyle[] = ['hands-off', 'balanced', 'hands-on']
  if (!validStyles.includes(workingStyle)) {
    return NextResponse.json({ error: 'invalid workingStyle' }, { status: 400 })
  }

  // Check user doesn't already have a workspace
  const { data: existingUser } = await supabase
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()

  if (existingUser?.workspace_id) {
    // Idempotent — return existing workspace so onboarding can continue
    const { data: existing } = await supabase
      .from('workspaces')
      .select('id, slug, name')
      .eq('id', existingUser.workspace_id)
      .single()
    if (existing) return NextResponse.json({ workspace: existing }, { status: 200 })
  }

  try {
    const slug = slugify(name.trim())
    const result = await createWorkspace({
      userId: user.id,
      name: name.trim(),
      slug,
      template,
      workingStyle,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Setup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
