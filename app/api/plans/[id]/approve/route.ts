import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { executePlanActions } from '@/lib/github/executor'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const planId = params.id
  const serviceClient = createServiceClient()

  // Verify plan belongs to user's workspace
  const { data: userRow } = await serviceClient
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()

  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: plan } = await serviceClient
    .from('plans')
    .select('id, status, channel_id')
    .eq('id', planId)
    .single()

  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  if (plan.status !== 'pending') {
    return NextResponse.json({ error: 'Plan is not pending' }, { status: 409 })
  }

  // Verify channel belongs to user's workspace (anti-IDOR)
  const { data: channel } = await serviceClient
    .from('channels')
    .select('workspace_id')
    .eq('id', plan.channel_id)
    .single()

  if (!channel || channel.workspace_id !== userRow.workspace_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Mark as approved immediately
  await serviceClient
    .from('plans')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', planId)

  // Post a "working on it" system message
  await serviceClient.from('messages').insert({
    channel_id: plan.channel_id,
    author_type: 'system',
    author_id: userRow.workspace_id,
    content: 'Approved — executing now…',
  })

  // Execute GitHub actions in the background
  waitUntil(
    executePlanActions(planId, userRow.workspace_id)
      .then(async () => {
        // Notify the channel when done
        await serviceClient.from('messages').insert({
          channel_id: plan.channel_id,
          author_type: 'system',
          author_id: userRow.workspace_id,
          content: 'Done — action completed on GitHub.',
        })
      })
      .catch(async (err: unknown) => {
        const reason = err instanceof Error ? err.message : 'Something went wrong on GitHub\'s side. Try again in a minute.'
        console.error('[plan:approve] execution failed:', reason)
        await serviceClient.from('messages').insert({
          channel_id: plan.channel_id,
          author_type: 'system',
          author_id: userRow.workspace_id,
          content: `⚠️ ${reason}`,
        })
      })
  )

  return NextResponse.json({ ok: true })
}
