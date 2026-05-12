import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()

  if (!userRow?.workspace_id) {
    return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
  }

  const { data: channels, error } = await supabase
    .from('channels')
    .select()
    .eq('workspace_id', userRow.workspace_id)
    .order('position')

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
  }

  // Fetch channel_members with bot_role details for all channels (two-step to avoid type issues)
  const channelIds = (channels ?? []).map((c) => c.id)
  let membersByChannel: Record<string, Array<{ id: string; name: string; avatar_seed: string; status: string; is_primary: boolean }>> = {}

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
        .select('id, display_name, avatar_seed, status')
        .in('id', botRoleIds)

      const botRoleMap = new Map((botRoleRows ?? []).map((b) => [b.id, b]))

      for (const m of memberRows) {
        const bot = botRoleMap.get(m.bot_role_id)
        if (!bot) continue
        if (!membersByChannel[m.channel_id]) membersByChannel[m.channel_id] = []
        membersByChannel[m.channel_id].push({
          id: bot.id,
          name: bot.display_name,
          avatar_seed: bot.avatar_seed,
          status: bot.status,
          is_primary: m.is_primary,
        })
      }
    }
  }

  const enriched = (channels ?? []).map((ch) => ({
    ...ch,
    members: membersByChannel[ch.id] ?? [],
  }))

  return NextResponse.json({ channels: enriched })
}
