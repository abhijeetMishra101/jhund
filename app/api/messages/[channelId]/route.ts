import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

interface Params {
  params: { channelId: string }
}

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createServiceClient()

  const { data: userRow } = await serviceClient
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()

  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Anti-IDOR: verify channel belongs to user's workspace
  const { data: channel } = await serviceClient
    .from('channels')
    .select('id')
    .eq('id', params.channelId)
    .eq('workspace_id', userRow.workspace_id)
    .single()

  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  const { data: messages, error } = await serviceClient
    .from('messages')
    .select('id, channel_id, author_type, author_id, content, plan_id, created_at, reply_count, parent_id')
    .eq('channel_id', params.channelId)
    .is('parent_id', null)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })

  return NextResponse.json(messages ?? [])
}
