import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getInstallationOctokit } from '@/lib/github/auth'
import { seedDefaultTriggers } from '@/lib/github/triggers'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const installationId = searchParams.get('installation_id')
  const state = searchParams.get('state')
  const setupAction = searchParams.get('setup_action')

  if (!installationId) {
    return NextResponse.redirect(new URL('/onboarding?github_error=1', request.url))
  }

  const cookieStore = await cookies()

  // setup_action=update means the user accepted a permission change on an existing
  // installation — no CSRF state cookie is set for this flow, skip state validation
  if (setupAction !== 'update') {
    const storedState = cookieStore.get('github_oauth_state')?.value
    if (!state || !storedState || state !== storedState) {
      return NextResponse.redirect(new URL('/onboarding?github_error=1', request.url))
    }
    cookieStore.delete('github_oauth_state')
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/auth/login', request.url))

    const serviceClient = createServiceClient()

    // Get user's workspace
    const { data: userRow } = await serviceClient
      .from('users')
      .select('workspace_id')
      .eq('id', user.id)
      .single()

    if (!userRow) return NextResponse.redirect(new URL('/onboarding?github_error=1', request.url))

    // Resolve repos accessible to this installation via GitHub API
    const octokit = await getInstallationOctokit(Number(installationId))
    const { data: reposData } = await octokit.rest.apps.listReposAccessibleToInstallation({ per_page: 1 })
    const firstRepo = reposData.repositories[0]
    const repoFullName = firstRepo?.full_name ?? 'pending'

    // Upsert the installation row with the resolved repo name
    await serviceClient
      .from('github_installations')
      .upsert(
        {
          workspace_id: userRow.workspace_id,
          installation_id: installationId,
          repo_full_name: repoFullName,
        },
        { onConflict: 'installation_id' }
      )

    // Seed default trigger routing rules based on workspace template
    await seedDefaultTriggers(userRow.workspace_id)

    // Get workspace slug for redirect
    const { data: workspace } = await serviceClient
      .from('workspaces')
      .select('slug')
      .eq('id', userRow.workspace_id)
      .single()

    if (!workspace) return NextResponse.redirect(new URL('/onboarding?github_error=1', request.url))

    return NextResponse.redirect(new URL(`/onboarding?github_connected=1&workspace=${workspace.slug}`, request.url))
  } catch {
    return NextResponse.redirect(new URL('/onboarding?github_error=1', request.url))
  }
}
