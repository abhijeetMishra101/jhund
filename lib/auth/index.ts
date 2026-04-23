import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/server'
import { seedWorkspace } from '@/lib/templates/seed'
import type { Database, Workspace, Channel } from '@/lib/supabase/types'

export type WorkspaceTemplate = 'startup' | 'enterprise' | 'blank'
export type WorkingStyle = 'hands-off' | 'balanced' | 'hands-on'

export interface CreateWorkspaceParams {
  userId: string
  name: string
  slug: string
  template: WorkspaceTemplate
  workingStyle: WorkingStyle
}

export interface CreateWorkspaceResult {
  workspace: Workspace
  channels: Channel[]
}

// Creates workspace row, seeds bot_roles + channels, inserts user row
export async function createWorkspace(
  params: CreateWorkspaceParams
): Promise<CreateWorkspaceResult> {
  const { userId, name, slug, template, workingStyle } = params
  const supabase = createServiceClient()

  // Insert workspace
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .insert({ name, slug, template, working_style: workingStyle })
    .select()
    .single()

  if (wsError || !workspace) {
    throw new Error(`Failed to create workspace: ${wsError?.message ?? 'no data'}`)
  }

  // Seed bot_roles and channels
  await seedWorkspace(workspace.id, name, template)

  // Insert user row (links auth.users → workspaces)
  const { error: userError } = await supabase
    .from('users')
    .insert({ id: userId, workspace_id: workspace.id, role: 'founder' })

  if (userError) throw new Error(`Failed to create user row: ${userError.message}`)

  // Fetch seeded channels to return
  const { data: channels, error: chError } = await supabase
    .from('channels')
    .select()
    .eq('workspace_id', workspace.id)
    .order('position')

  if (chError) throw new Error(`Failed to fetch channels: ${chError.message}`)

  return { workspace, channels: channels ?? [] }
}

// Returns the workspace for the current session user, or null
export async function getWorkspace(userId: string): Promise<Workspace | null> {
  const supabase = createServiceClient()

  const { data: userRow } = await supabase
    .from('users')
    .select('workspace_id')
    .eq('id', userId)
    .single()

  if (!userRow) return null

  const { data: workspace } = await supabase
    .from('workspaces')
    .select()
    .eq('id', userRow.workspace_id)
    .single()

  return workspace ?? null
}

// Generates a URL-safe slug from a workspace name
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}
