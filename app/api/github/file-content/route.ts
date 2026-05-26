import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getInstallationOctokit } from '@/lib/github/auth'

/** Parse a GitHub blob URL into its components.
 *  Expected format: https://github.com/{owner}/{repo}/blob/{branch}/{path}
 */
function parseGithubBlobUrl(url: string): { owner: string; repo: string; branch: string; path: string } | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'github.com') return null
    // pathname: /{owner}/{repo}/blob/{branch}/{...path}
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts.length < 5 || parts[2] !== 'blob') return null
    const [owner, repo, , branch, ...pathParts] = parts
    if (!owner || !repo || !branch || pathParts.length === 0) return null
    return { owner, repo, branch, path: pathParts.join('/') }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Parse the URL query param
  const { searchParams } = new URL(request.url)
  const githubUrl = searchParams.get('url')
  if (!githubUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  const parsed = parseGithubBlobUrl(githubUrl)
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid GitHub blob URL' }, { status: 400 })
  }

  // Get workspace + github installation
  const service = createServiceClient()
  const { data: userData } = await service
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()

  if (!userData?.workspace_id) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const { data: installation } = await service
    .from('github_installations')
    .select('installation_id')
    .eq('workspace_id', userData.workspace_id)
    .single()

  if (!installation) {
    return NextResponse.json({ error: 'No GitHub installation for this workspace' }, { status: 404 })
  }

  // Fetch the file via Octokit
  try {
    const octokit = await getInstallationOctokit(Number(installation.installation_id))
    const { data } = await octokit.rest.repos.getContent({
      owner: parsed.owner,
      repo: parsed.repo,
      path: parsed.path,
      ref: parsed.branch,
    })

    if (Array.isArray(data) || data.type !== 'file') {
      return NextResponse.json({ error: 'Not a file' }, { status: 400 })
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8')
    return NextResponse.json({ content })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    throw err
  }
}
