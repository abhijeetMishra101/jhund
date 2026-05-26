import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getInstallationOctokit } from '@/lib/github/auth'

/** Parse a GitHub blob URL into its components.
 *  Handles branch names that contain slashes (e.g. bot/docs-2026-05-26-slug).
 *
 *  Strategy: find the first occurrence of 'docs/discussions/' in the remainder
 *  after /blob/ — everything before it is the branch, everything from it is
 *  the file path. Falls back to treating the first segment as a single-level
 *  branch for any URL that doesn't match our discussion-file pattern.
 *
 *  Examples:
 *    …/blob/main/docs/discussions/foo.md         → branch=main, path=docs/discussions/foo.md
 *    …/blob/bot/docs-2026-05-26-x/docs/discussions/foo.md → branch=bot/docs-2026-05-26-x, path=docs/discussions/foo.md
 */
function parseGithubBlobUrl(url: string): { owner: string; repo: string; branch: string; path: string } | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'github.com') return null
    // pathname: /{owner}/{repo}/blob/{...branchAndPath}
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts.length < 5 || parts[2] !== 'blob') return null
    const owner = parts[0]
    const repo = parts[1]
    if (!owner || !repo) return null

    // Everything after /blob/ joined back together
    const afterBlob = parts.slice(3).join('/')

    // Anchor on 'docs/discussions/' to split branch from path unambiguously.
    // This works whether the branch is 'main' or a multi-level 'bot/docs-*' name.
    const anchor = 'docs/discussions/'
    const anchorIdx = afterBlob.indexOf(anchor)
    if (anchorIdx > 0) {
      const branch = afterBlob.slice(0, anchorIdx - 1) // strip trailing /
      const path = afterBlob.slice(anchorIdx)
      if (!branch || !path) return null
      return { owner, repo, branch, path }
    }

    // Fallback: single-level branch (e.g. 'main') with a non-standard path
    const [branch, ...pathParts] = parts.slice(3)
    if (!branch || pathParts.length === 0) return null
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
