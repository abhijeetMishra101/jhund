import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SettingsShell from './SettingsShell'

interface Props {
  params: { slug: string }
}

export default async function SettingsPage({ params }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: userRow } = await supabase.from('users').select('workspace_id').eq('id', user.id).single()
  if (!userRow) redirect('/onboarding')

  const { data: workspace } = await supabase.from('workspaces').select().eq('id', userRow.workspace_id).single()
  if (!workspace || workspace.slug !== params.slug) redirect('/auth/login')

  const [{ data: botRoles }, { data: channels }, { data: installation }] = await Promise.all([
    supabase.from('bot_roles').select().eq('workspace_id', workspace.id).order('created_at'),
    supabase.from('channels').select().eq('workspace_id', workspace.id).eq('archived', false).order('position'),
    supabase.from('github_installations').select().eq('workspace_id', workspace.id).single(),
  ])

  return (
    <SettingsShell
      workspace={workspace}
      botRoles={botRoles ?? []}
      channels={channels ?? []}
      installation={installation ?? null}
    />
  )
}
