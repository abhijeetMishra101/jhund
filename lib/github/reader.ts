import { createServiceClient } from '@/lib/supabase/server'
import { getInstallationOctokit } from '@/lib/github/auth'

export class FileNotFoundError extends Error {
  constructor(path: string) {
    super(`File not found: ${path}`)
    this.name = 'FileNotFoundError'
  }
}

export class FileAccessDeniedError extends Error {
  constructor(path: string) {
    super(`Access denied: ${path}`)
    this.name = 'FileAccessDeniedError'
  }
}

export class NoGithubInstallationError extends Error {
  constructor() {
    super('No GitHub installation linked to this workspace')
    this.name = 'NoGithubInstallationError'
  }
}

const MAX_CONTENT_CHARS = 8000

/**
 * Reads the contents of a file from the connected GitHub repository for a workspace.
 *
 * @param workspaceId - The workspace whose GitHub installation to use
 * @param path - File path relative to repo root, e.g. "src/m1/collector.py"
 * @param branch - Branch to read from. Omits to use the repo default branch.
 * @returns Decoded file content, its SHA, and whether it was truncated to 8000 chars
 * @throws NoGithubInstallationError if no installation is linked or repo is 'pending'
 * @throws FileNotFoundError on 404
 * @throws FileAccessDeniedError on 403
 */
export async function readGithubFile(
  workspaceId: string,
  path: string,
  branch?: string
): Promise<{ content: string; sha: string; truncated: boolean }> {
  const supabase = createServiceClient()

  const { data: installation } = await supabase
    .from('github_installations')
    .select('installation_id, repo_full_name')
    .eq('workspace_id', workspaceId)
    .single()

  if (!installation || !installation.repo_full_name || installation.repo_full_name === 'pending') {
    throw new NoGithubInstallationError()
  }

  const octokit = await getInstallationOctokit(Number(installation.installation_id))
  const [owner, repo] = installation.repo_full_name.split('/')

  // Resolve the branch to read from
  let ref = branch
  if (!ref) {
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
    ref = repoData.default_branch
  }

  // Fetch the file content
  let fileData: Awaited<ReturnType<typeof octokit.rest.repos.getContent>>['data']
  try {
    const response = await octokit.rest.repos.getContent({ owner, repo, path, ref })
    fileData = response.data
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 404) throw new FileNotFoundError(path)
    if (status === 403) throw new FileAccessDeniedError(path)
    throw err
  }

  // Guard: should be a single file, not a directory
  if (Array.isArray(fileData) || fileData.type !== 'file') {
    throw new FileNotFoundError(path)
  }

  // Decode base64 content
  const decoded = Buffer.from(fileData.content, 'base64').toString('utf-8')

  // Truncate to MAX_CONTENT_CHARS if necessary
  const truncated = decoded.length > MAX_CONTENT_CHARS
  const content = truncated ? decoded.slice(0, MAX_CONTENT_CHARS) : decoded

  return { content, sha: fileData.sha, truncated }
}
