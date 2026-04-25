import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
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

  const { data: plan } = await serviceClient
    .from('plans')
    .select('id, status, description_md, channel_id')
    .eq('id', params.id)
    .single()

  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Anti-IDOR
  const { data: channel } = await serviceClient
    .from('channels')
    .select('workspace_id')
    .eq('id', plan.channel_id)
    .single()

  if (!channel || channel.workspace_id !== userRow.workspace_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    id: plan.id,
    status: plan.status,
    description_md: plan.description_md,
  })
}
