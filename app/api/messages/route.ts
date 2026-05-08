import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { respondToMessage } from '@/lib/bots'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { channelId?: string; content?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { channelId, content } = body
  if (!channelId || typeof channelId !== 'string' || !content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'channelId and content are required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Resolve workspace for this user
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

  // Insert user message
  const { data: message, error: insertError } = await serviceClient
    .from('messages')
    .insert({
      channel_id: channelId,
      author_type: 'user',
      author_id: user.id,
      content: content.trim(),
    })
    .select('id')
    .single()

  if (insertError || !message) {
    return NextResponse.json({ error: 'Failed to store message' }, { status: 500 })
  }

  // Keep the serverless function alive until the bot responds (Vercel kills
  // execution as soon as the response is sent without waitUntil)
  waitUntil(
    respondToMessage(channelId, userRow.workspace_id).catch((err: unknown) => {
      console.error('[bot] respondToMessage failed:', err)
    })
  )

  return NextResponse.json({ id: message.id }, { status: 201 })
}
