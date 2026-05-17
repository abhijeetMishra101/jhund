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
      .select('id, display_name, avatar_seed, status, role_key')
      .eq('workspace_id', workspace.id),
  ])

  // Build a map for quick lookup — used both for member enrichment and DM fallback
  const botRoleMap = new Map((botRoles ?? []).map((b) => [b.id, b]))

  // Enrich channels with members (two-step join to avoid Supabase type issues)
  const channelIds = (channels ?? []).map((c) => c.id)
  const membersByChannel: Record<string, ChannelWithMembers['members']> = {}

  if (channelIds.length > 0) {
    const { data: memberRows } = await supabase
      .from('channel_members')
      .select('channel_id, bot_role_id, is_primary')
      .in('channel_id', channelIds)
      .order('created_at', { ascending: true })

    if (memberRows && memberRows.length > 0) {
      for (const m of memberRows) {
        const bot = botRoleMap.get(m.bot_role_id)
        if (!bot) continue
        if (!membersByChannel[m.channel_id]) membersByChannel[m.channel_id] = []
        membersByChannel[m.channel_id].push({
          bot_role_id: bot.id,
          display_name: bot.display_name,
          avatar_seed: bot.avatar_seed,
          status: bot.status ?? 'offline',
          role_key: bot.role_key ?? '',
          is_primary: m.is_primary,
        })
      }
    }
  }

  /**
   * Infer the true channel_type from the name when the DB still stores 'channel'.
   * Standup/retrospective channels created before the enum migration will have
   * channel_type='channel' but a name that clearly identifies them.
   */
  function inferChannelType(
    name: string,
    dbType: string | null,
  ): ChannelWithMembers['channel_type'] {
    if (dbType && dbType !== 'channel') return dbType as ChannelWithMembers['channel_type']
    if (name === 'standup') return 'standup'
    if (name === 'retrospective') return 'retrospective'
    return 'channel'
  }

  const enrichedChannels: ChannelWithMembers[] = (channels ?? []).map((ch) => {
    let members = membersByChannel[ch.id] ?? []

    // Fallback: if channel_members is empty for this channel but the channel
    // row has a bot_role_id (always set for DM channels; sometimes set for
    // legacy single-bot channels), synthesise a member from bot_roles.
    if (members.length === 0 && ch.bot_role_id) {
      const bot = botRoleMap.get(ch.bot_role_id)
      if (bot) {
        members = [{
          bot_role_id: bot.id,
          display_name: bot.display_name,
          avatar_seed: bot.avatar_seed,
          status: bot.status ?? 'offline',
          role_key: bot.role_key ?? '',
          is_primary: true,
        }]
      }
    }

    return {
      ...ch,
      // Strip any leading "# " from display_name — some workspaces were seeded
      // with it already included; the sidebar and header always prepend their own "#".
      display_name: ch.display_name.replace(/^#+\s*/, ''),
      channel_type: inferChannelType(ch.name, ch.channel_type),
      members,
    }
  })

  return (
    <WorkspaceShell
      workspace={workspace}
      channels={enrichedChannels}
      botRoles={botRoles ?? []}
    />
  )
}
