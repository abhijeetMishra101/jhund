import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

type OwnershipOk = { ok: true; workspaceId: string; userId: string }
type OwnershipErr = { ok: false; response: NextResponse }
type OwnershipResult = OwnershipOk | OwnershipErr

/** Verify the authenticated user owns the workspace that contains this channel.
 *  Returns { ok: true, workspaceId, userId } on success or { ok: false, response } error. */
async function resolveOwnership(channelId: string): Promise<OwnershipResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const service = createServiceClient()

  // Get user's workspace
  const { data: userRow } = await service
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()
  if (!userRow?.workspace_id) {
    return { ok: false, response: NextResponse.json({ error: 'Workspace not found' }, { status: 404 }) }
  }

  // Verify channel belongs to that workspace
  const { data: channel } = await service
    .from('channels')
    .select('id, workspace_id')
    .eq('id', channelId)
    .single()
  if (!channel || channel.workspace_id !== userRow.workspace_id) {
    return { ok: false, response: NextResponse.json({ error: 'Channel not found' }, { status: 404 }) }
  }

  return { ok: true, workspaceId: userRow.workspace_id as string, userId: user.id }
}

/** POST /api/channels/[id]/members
 *  Body: { bot_role_id: string }
 *  Adds a bot to a channel. Returns 409 if already a member. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: channelId } = await params
  const ownership = await resolveOwnership(channelId)
  if (!ownership.ok) return ownership.response

  let body: { bot_role_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { bot_role_id } = body
  if (!bot_role_id) {
    return NextResponse.json({ error: 'bot_role_id is required' }, { status: 400 })
  }

  const service = createServiceClient()

  // Verify the bot belongs to the same workspace
  const { data: bot } = await service
    .from('bot_roles')
    .select('id, display_name, avatar_seed, role_key, status')
    .eq('id', bot_role_id)
    .eq('workspace_id', ownership.workspaceId)
    .single()
  if (!bot) {
    return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
  }

  // Check for existing membership
  const { data: existing } = await service
    .from('channel_members')
    .select('channel_id')
    .eq('channel_id', channelId)
    .eq('bot_role_id', bot_role_id)
    .single()
  if (existing) {
    return NextResponse.json({ error: 'Bot is already in this channel' }, { status: 409 })
  }

  // Insert
  const { error: insertError } = await service
    .from('channel_members')
    .insert({ channel_id: channelId, bot_role_id, is_primary: false })

  if (insertError) {
    return NextResponse.json({ error: 'Failed to add bot to channel' }, { status: 500 })
  }

  const member = {
    bot_role_id: bot.id,
    display_name: bot.display_name,
    avatar_seed: bot.avatar_seed,
    role_key: bot.role_key,
    is_primary: false,
    status: bot.status ?? 'online',
  }

  return NextResponse.json({ member }, { status: 201 })
}
