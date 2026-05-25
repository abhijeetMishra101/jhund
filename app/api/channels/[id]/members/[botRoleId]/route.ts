import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/** DELETE /api/channels/[id]/members/[botRoleId]
 *  Removes a bot from a channel. Returns 204 on success. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; botRoleId: string }> }
): Promise<NextResponse | Response> {
  const { id: channelId, botRoleId } = await params

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

  // Verify channel belongs to that workspace
  const { data: channel } = await service
    .from('channels')
    .select('id, workspace_id')
    .eq('id', channelId)
    .single()
  if (!channel || channel.workspace_id !== userRow.workspace_id) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  const { error: deleteError } = await service
    .from('channel_members')
    .delete()
    .eq('channel_id', channelId)
    .eq('bot_role_id', botRoleId)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to remove bot from channel' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
