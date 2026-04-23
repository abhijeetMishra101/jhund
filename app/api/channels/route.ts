import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()

  if (!userRow?.workspace_id) {
    return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
  }

  const { data: channels, error } = await supabase
    .from('channels')
    .select()
    .eq('workspace_id', userRow.workspace_id)
    .order('position')

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
  }

  return NextResponse.json({ channels: channels ?? [] })
}
