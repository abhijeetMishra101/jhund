/**
 * Commits a discussion summary Markdown file directly to the GitHub repo's
 * docs/discussions/ folder on the default branch.
 *
 * Does NOT go through the plan approval modal — this is a direct commit.
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

  // Get the repo's default branch
  const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
  const defaultBranch = repoData.default_branch

  const dateStr = todayDateString()
  const slug = slugify(params.title)
  const filePath = `docs/discussions/${dateStr}-${slug}.md`
  const fileContent = `# ${params.title}\n\n${params.summary}\n`
  const commitMessage = `docs: add discussion summary — ${params.title}`

  // Check if the file already exists (for idempotency — get SHA if it does)
  let existingSha: string | undefined
  try {
    const { data: existing } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: defaultBranch,
    })
    if (!Array.isArray(existing) && existing.type === 'file') {
      existingSha = existing.sha
    }
  } catch {
    // File doesn't exist yet — that's the expected case
  }

  const { data: commitData } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: commitMessage,
    content: Buffer.from(fileContent).toString('base64'),
    branch: defaultBranch,
    ...(existingSha ? { sha: existingSha } : {}),
  })

  const url = commitData.content?.html_url ?? undefined

  return {
    committed: true,
    path: filePath,
    url,
  }
}
