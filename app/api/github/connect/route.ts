import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const slug = process.env.GITHUB_APP_SLUG
  if (!slug) return NextResponse.json({ error: 'GitHub App not configured' }, { status: 500 })

  const state = crypto.randomUUID()
  const cookieStore = await cookies()
  cookieStore.set('github_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const installUrl = `https://github.com/apps/${slug}/installations/new?state=${state}`
  return NextResponse.redirect(installUrl)
}
