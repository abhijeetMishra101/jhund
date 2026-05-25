import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/** GET /api/channels/[id]/available-bots
 *  Returns all workspace bots NOT already in this channel. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: channelId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Get user's workspace
  const { data: userRow } = await service
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()
  if (!userRow?.workspace_id) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const workspaceId = userRow.workspace_id as string

  // Verify channel belongs to this workspace
  const { data: channel } = await service
    .from('channels')
    .select('id, workspace_id, display_name')
    .eq('id', channelId)
    .single()
  if (!channel || channel.workspace_id !== workspaceId) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  // Get bots already in the channel
  const { data: currentMembers } = await service
    .from('channel_members')
    .select('bot_role_id')
    .eq('channel_id', channelId)

  const existingBotIds = new Set((currentMembers ?? []).map((m) => m.bot_role_id))

  // Get all bots in the workspace
  const { data: allBots, error } = await service
    .from('bot_roles')
    .select('id, display_name, avatar_seed, role_key, status')
    .eq('workspace_id', workspaceId)
    .order('display_name')

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch bots' }, { status: 500 })
  }

  const available = (allBots ?? []).filter((b) => !existingBotIds.has(b.id))

  return NextResponse.json({ bots: available, channelName: channel.display_name })
}
