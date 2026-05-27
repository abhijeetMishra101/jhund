import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { undoDecision } from '@/lib/decisions/undo'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: channelId } = await params

  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Resolve workspace
  const { data: userRow } = await service
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()
  if (!userRow?.workspace_id) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }
  const workspaceId = userRow.workspace_id as string

  // Verify channel belongs to workspace
  const { data: channel } = await service
    .from('channels')
    .select('id, workspace_id')
    .eq('id', channelId)
    .single()
  if (!channel || channel.workspace_id !== workspaceId) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  // Resolve the primary bot in this channel (needed for posting notices)
  const { data: membership } = await service
    .from('channel_members')
    .select('bot_role_id')
    .eq('channel_id', channelId)
    .eq('is_primary', true)
    .single()
  const botRoleId = membership?.bot_role_id ?? ''

  const result = await undoDecision(workspaceId, channelId, botRoleId)

  if (!result.undone) {
    return NextResponse.json({ undone: false })
  }

  // Post confirmation back to source channel as a system message
  const systemContent = result.actionWasDispatched
    ? `↩️ Removed. Worth noting — the team already saw this. You may want to give them a heads-up.`
    : `↩️ Done — I've quietly removed that from the record. It's like it never happened.`

  await service.from('messages').insert({
    channel_id: channelId,
    author_type: 'system' as const,
    author_id: botRoleId || user.id,
    content: systemContent,
  })

  return NextResponse.json({ undone: true, title: result.title })
}
