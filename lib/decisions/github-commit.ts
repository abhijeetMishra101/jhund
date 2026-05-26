/**
 * Commits a discussion summary Markdown file to the GitHub repo under
 * docs/discussions/ on a dedicated bot/docs-{slug} branch (not main).
 *
 * Committing to main is blocked by branch protection — we use a bot/ branch
 * so the file lands in GitHub without needing CI approval.
 * If no GitHub installation is connected, returns { committed: false }.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { getInstallationOctokit } from '@/lib/github/auth'

export interface CommitDiscussionDocParams {
  workspaceId: string
  title: string
  summary: string
}

export interface CommitDiscussionDocResult {
  committed: boolean
  path?: string
  url?: string
}

/**
 * Slugifies a title for use as a filename component.
 * Example: "Rate Limiting Strategy" → "rate-limiting-strategy"
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

/**
 * Returns today's date in YYYY-MM-DD format (UTC).
 */
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Commits a .md file with the discussion summary to docs/discussions/ in the repo.
 */
export async function commitDiscussionDoc(
  params: CommitDiscussionDocParams
): Promise<CommitDiscussionDocResult> {
  const supabase = createServiceClient()

  // Check for a GitHub installation for this workspace
  const { data: installation } = await supabase
    .from('github_installations')
    .select('installation_id, repo_full_name')
    .eq('workspace_id', params.workspaceId)
    .single()

  if (!installation || !installation.repo_full_name || installation.repo_full_name === 'pending') {
    return { committed: false }
  }

  const octokit = await getInstallationOctokit(Number(installation.installation_id))
  const [owner, repo] = installation.repo_full_name.split('/')

  // Get the repo's default branch SHA to base the bot branch on
  const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
  const defaultBranch = repoData.default_branch

  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  })
  const baseSha = refData.object.sha

  const dateStr = todayDateString()
  const slug = slugify(params.title)
  const filePath = `docs/discussions/${dateStr}-${slug}.md`
  const fileContent = `# ${params.title}\n\n${params.summary}\n`
  const commitMessage = `docs: add discussion summary — ${params.title}`

  // Use a bot/ branch — main is protected and blocks direct commits
  const branchName = `bot/docs-${dateStr}-${slug}`.slice(0, 100)

  // Create the branch (idempotent — ignore 422 if it already exists)
  try {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    })
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status !== 422) throw err // 422 = branch already exists, that's fine
  }

  // Check if the file already exists on this branch (idempotency)
  let existingSha: string | undefined
  try {
    const { data: existing } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branchName,
    })
    if (!Array.isArray(existing) && existing.type === 'file') {
      existingSha = existing.sha
    }
  } catch {
    // File doesn't exist yet — expected
  }

  const { data: commitData } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: commitMessage,
    content: Buffer.from(fileContent).toString('base64'),
    branch: branchName,
    ...(existingSha ? { sha: existingSha } : {}),
  })

  const url = commitData.content?.html_url ?? undefined

  return {
    committed: true,
    path: filePath,
    url,
  }
}
