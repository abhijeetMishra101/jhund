import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { HIREABLE_ROLE_KEYS, getRoleDefinition, getRoleSystemPrompt, getRoleLabel } from '@/lib/templates/roles'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { roleKey?: string; displayName?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { roleKey, displayName } = body
  if (!roleKey || !HIREABLE_ROLE_KEYS.includes(roleKey)) {
    return NextResponse.json({ error: 'Invalid role key' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: userRow } = await service.from('users').select('workspace_id').eq('id', user.id).single()
  if (!userRow?.workspace_id) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  const workspaceId = userRow.workspace_id

  const { data: workspace } = await service.from('workspaces').select('name').eq('id', workspaceId).single()
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  // Prevent duplicates
  const { data: existing } = await service.from('bot_roles')
    .select('id').eq('workspace_id', workspaceId).eq('role_key', roleKey).single()
  if (existing) return NextResponse.json({ error: 'Role already hired' }, { status: 400 })

  const def = getRoleDefinition(roleKey)
  const finalDisplayName = (displayName?.trim() || def.display_name).slice(0, 32)

  // Insert bot_role
  const { data: bot, error: botError } = await service.from('bot_roles').insert({
    workspace_id: workspaceId,
    role_key: roleKey,
    display_name: finalDisplayName,
    avatar_seed: def.avatar_seed,
    system_prompt: getRoleSystemPrompt(roleKey, workspace.name),
  }).select().single()

  if (botError || !bot) return NextResponse.json({ error: 'Failed to create bot' }, { status: 500 })

  // Get next channel position
  const { data: lastChannel } = await service.from('channels')
    .select('position').eq('workspace_id', workspaceId).order('position', { ascending: false }).limit(1).single()
  const nextPosition = (lastChannel?.position ?? -1) + 1

  // Insert channel
  const { data: channel, error: channelError } = await service.from('channels').insert({
    workspace_id: workspaceId,
    name: roleKey,
    display_name: `# ${roleKey}`,
    bot_role_id: bot.id,
    position: nextPosition,
  }).select().single()

  if (channelError || !channel) return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 })

  // Seed channel_members — bot is primary in their own channel
  await service.from('channel_members').insert({
    channel_id: channel.id,
    bot_role_id: bot.id,
    is_primary: true,
  })

  // Post welcome message in new channel
  await service.from('messages').insert({
    channel_id: channel.id,
    author_type: 'bot',
    author_id: bot.id,
    content: `Hi! I'm ${finalDisplayName}, your new ${getRoleLabel(roleKey)} teammate. Ask me anything about ${def.domain}.`,
  })

  // Get ops channel + bot for announcement
  const { data: opsChannel } = await service.from('channels')
    .select('id, bot_role_id').eq('workspace_id', workspaceId).eq('name', 'ops').single()

  if (opsChannel?.id && opsChannel.bot_role_id) {
    await service.from('messages').insert({
      channel_id: opsChannel.id,
      author_type: 'bot',
      author_id: opsChannel.bot_role_id,
      content: `👋 ${finalDisplayName} just joined the team. Say hi in #${roleKey}.`,
    })
  }

  return NextResponse.json({ bot, channel }, { status: 201 })
}
