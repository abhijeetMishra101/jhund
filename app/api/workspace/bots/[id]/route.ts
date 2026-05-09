import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: userRow } = await service.from('users').select('workspace_id').eq('id', user.id).single()
  if (!userRow?.workspace_id) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  const { data: bot } = await service.from('bot_roles')
    .select('id, workspace_id, role_key, display_name').eq('id', params.id).single()

  if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
  if (bot.workspace_id !== userRow.workspace_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (bot.role_key === 'ops') return NextResponse.json({ error: 'Cannot fire Riley — ops channel is permanent' }, { status: 400 })

  // Find bot's channel
  const { data: channel } = await service.from('channels')
    .select('id').eq('bot_role_id', bot.id).single()

  if (channel) {
    // Post farewell message
    await service.from('messages').insert({
      channel_id: channel.id,
      author_type: 'bot',
      author_id: bot.id,
      content: `It's been a pleasure working with you. Signing off. 👋`,
    })

    // Soft-archive the channel
    await service.from('channels').update({ archived: true }).eq('id', channel.id)
  }

  // Riley announces in ops
  const { data: opsChannel } = await service.from('channels')
    .select('id, bot_role_id').eq('workspace_id', userRow.workspace_id).eq('name', 'ops').single()

  if (opsChannel?.id && opsChannel.bot_role_id) {
    await service.from('messages').insert({
      channel_id: opsChannel.id,
      author_type: 'bot',
      author_id: opsChannel.bot_role_id,
      content: `${bot.display_name} has left the team.`,
    })
  }

  return NextResponse.json({ ok: true })
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { displayName?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const displayName = body.displayName?.trim()
  if (!displayName) return NextResponse.json({ error: 'displayName is required' }, { status: 400 })
  if (displayName.length > 32) return NextResponse.json({ error: 'displayName must be 32 chars or fewer' }, { status: 400 })

  const service = createServiceClient()

  const { data: userRow } = await service.from('users').select('workspace_id').eq('id', user.id).single()
  if (!userRow?.workspace_id) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  const { data: bot } = await service.from('bot_roles')
    .select('id, workspace_id, display_name').eq('id', params.id).single()

  if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
  if (bot.workspace_id !== userRow.workspace_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const oldName = bot.display_name

  const { data: updated, error } = await service.from('bot_roles')
    .update({ display_name: displayName }).eq('id', params.id).select().single()

  if (error || !updated) return NextResponse.json({ error: 'Failed to rename bot' }, { status: 500 })

  // Riley announces rename in ops
  const { data: opsChannel } = await service.from('channels')
    .select('id, bot_role_id').eq('workspace_id', userRow.workspace_id).eq('name', 'ops').single()

  if (opsChannel?.id && opsChannel.bot_role_id) {
    await service.from('messages').insert({
      channel_id: opsChannel.id,
      author_type: 'bot',
      author_id: opsChannel.bot_role_id,
      content: `${oldName} is now going by ${displayName}.`,
    })
  }

  return NextResponse.json({ bot: updated })
}
