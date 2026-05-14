import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WorkspaceShell from './WorkspaceShell'
import type { ChannelWithMembers } from '@/lib/supabase/types'

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

  // Enrich channels with members (two-step join to avoid Supabase type issues)
  const channelIds = (channels ?? []).map((c) => c.id)
  let membersByChannel: Record<string, ChannelWithMembers['members']> = {}

  if (channelIds.length > 0) {
    const { data: memberRows } = await supabase
      .from('channel_members')
      .select('channel_id, bot_role_id, is_primary')
      .in('channel_id', channelIds)
      .order('created_at', { ascending: true })

    if (memberRows && memberRows.length > 0) {
      const botRoleIds = Array.from(new Set(memberRows.map((m) => m.bot_role_id)))
      const { data: botRoleRows } = await supabase
        .from('bot_roles')
        .select('id, display_name, avatar_seed, status, role_key')
        .in('id', botRoleIds)

      const botRoleMap = new Map((botRoleRows ?? []).map((b) => [b.id, b]))

      for (const m of memberRows) {
        const bot = botRoleMap.get(m.bot_role_id)
        if (!bot) continue
        if (!membersByChannel[m.channel_id]) membersByChannel[m.channel_id] = []
        membersByChannel[m.channel_id].push({
          bot_role_id: bot.id,
          display_name: bot.display_name,
          avatar_seed: bot.avatar_seed,
          status: bot.status,
          role_key: bot.role_key,
          is_primary: m.is_primary,
        })
      }
    }
  }

  const enrichedChannels: ChannelWithMembers[] = (channels ?? []).map((ch) => ({
    ...ch,
    channel_type: ch.channel_type ?? 'channel',
    members: membersByChannel[ch.id] ?? [],
  }))

  return (
    <WorkspaceShell
      workspace={workspace}
      channels={enrichedChannels}
      botRoles={botRoles ?? []}
    />
  )
}
