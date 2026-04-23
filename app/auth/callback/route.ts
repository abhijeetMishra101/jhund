import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { CookieOptions } from '@supabase/ssr'
import type { Database } from '@/lib/supabase/types'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Reject open redirects — only allow relative paths on same origin
  const redirectTo = next.startsWith('/') ? next : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_code`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`)
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/auth/login?error=no_user`)
  }

  // Check if user already has a workspace
  const { data: userRow } = await supabase
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()

  if (userRow?.workspace_id) {
    // Existing user — fetch workspace slug and send to workspace
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('slug')
      .eq('id', userRow.workspace_id)
      .single()

    if (workspace?.slug) {
      return NextResponse.redirect(`${origin}/w/${workspace.slug}`)
    }
  }

  // New user — send to onboarding
  return NextResponse.redirect(`${origin}/onboarding`)
}
