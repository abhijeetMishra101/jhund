import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id: channelId, messageId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createServiceClient()

  // Resolve workspace
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
    .eq('id', channelId)
    .eq('workspace_id', userRow.workspace_id)
    .single()

  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  // Fetch thread replies
  const { data: messages, error } = await serviceClient
    .from('messages')
    .select()
    .eq('channel_id', channelId)
    .eq('parent_id', messageId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch thread replies' }, { status: 500 })
  }

  return NextResponse.json({ messages: messages ?? [] })
}
