import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const planId = params.id
  const serviceClient = createServiceClient()

  const { data: userRow } = await serviceClient
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()

  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: plan } = await serviceClient
    .from('plans')
    .select('id, status, channel_id, bot_role_id')
    .eq('id', planId)
    .single()

  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  if (plan.status !== 'pending') {
    return NextResponse.json({ error: 'Plan is not pending' }, { status: 409 })
  }

  // Anti-IDOR check
  const { data: channel } = await serviceClient
    .from('channels')
    .select('workspace_id')
    .eq('id', plan.channel_id)
    .single()

  if (!channel || channel.workspace_id !== userRow.workspace_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await serviceClient
    .from('plans')
    .update({ status: 'rejected' })
    .eq('id', planId)

  // Post a bot acknowledgement message
  await serviceClient.from('messages').insert({
    channel_id: plan.channel_id,
    author_type: 'bot',
    author_id: plan.bot_role_id,
    content: "Understood — I won't take that action. Let me know if you'd like me to do something different.",
  })

  return NextResponse.json({ ok: true })
}
