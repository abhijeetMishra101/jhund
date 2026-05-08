import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WorkspaceShell from './WorkspaceShell'

interface Props {
  params: { slug: string }
}

export default async function WorkspacePage({ params }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: userRow } = await supabase
    .from('users')
    .select()
    .eq('id', user.id)
    .single()

  if (!userRow) redirect('/onboarding')

  const { data: workspace } = await supabase
    .from('workspaces')
    .select()
    .eq('id', userRow.workspace_id)
    .single()

  if (!workspace || workspace.slug !== params.slug) redirect('/auth/login')

  const [{ data: channels }, { data: botRoles }] = await Promise.all([
    supabase
      .from('channels')
      .select()
      .eq('workspace_id', workspace.id)
      .eq('archived', false)
      .order('position'),
    supabase
      .from('bot_roles')
      .select('id, display_name, avatar_seed')
      .eq('workspace_id', workspace.id),
  ])

  return (
    <WorkspaceShell
      workspace={workspace}
      channels={channels ?? []}
      botRoles={botRoles ?? []}
    />
  )
}
