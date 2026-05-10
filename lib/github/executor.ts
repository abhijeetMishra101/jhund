import { Octokit } from '@octokit/rest'
import { createServiceClient } from '@/lib/supabase/server'
import { getInstallationOctokit } from '@/lib/github/auth'
import type { Json } from '@/lib/supabase/types'

export class ActionCapExceededError extends Error {
  constructor() {
    super('Your team has used all their GitHub actions for this period. Reset the counter to continue.')
    this.name = 'ActionCapExceededError'
  }
}

interface GithubAction {
  action_type: 'create_pr' | 'create_issue' | 'comment_pr' | 'comment_issue' | 'commit_file'
  payload: Record<string, unknown>
}

/**
 * Executes all github_actions from a plan row using the GitHub App installation token.
 * Requires the workspace to have a linked github_installations row.
 */
export async function executePlanActions(planId: string, workspaceId: string): Promise<void> {
  const supabase = createServiceClient()

  // Atomically claim the plan — only proceeds if status is 'approved'.
  // Prevents double-execution if approve is called twice concurrently (F-001).
  const { data: claimed } = await supabase
    .from('plans')
    .update({ status: 'executing' } as never)
    .eq('id', planId)
    .eq('status', 'approved')
    .select('github_actions, channel_id')
    .single()

  if (!claimed) {
    // Plan was already executing, executed, failed, or not found — do nothing
    return
  }

  const plan = claimed

  // Resolve the GitHub installation for this workspace
  const { data: installation } = await supabase
    .from('github_installations')
    .select('installation_id, repo_full_name')
    .eq('workspace_id', workspaceId)
    .single()

  if (!installation) {
    throw new Error('No GitHub installation linked to this workspace')
  }

  if (!installation.repo_full_name || installation.repo_full_name === 'pending') {
    throw new Error('GitHub repo not yet connected. Go to Settings → Integrations to connect your repository.')
  }

  // Enforce action cap atomically — only GitHub execution counts against budget
  const { data: allowed } = await supabase.rpc('increment_action_count', {
    p_workspace_id: workspaceId,
  })
  if (!allowed) throw new ActionCapExceededError()

  // Post 80% warning once when crossing the threshold
  const { data: ws } = await supabase
    .from('workspaces')
    .select('actions_used, action_cap')
    .eq('id', workspaceId)
    .single()

  if (ws) {
    const pct = ws.actions_used / ws.action_cap
    if (pct >= 0.8 && pct < 0.9) {
      await supabase.from('messages').insert({
        channel_id: plan.channel_id,
        author_type: 'system',
        author_id: workspaceId,
        content: `⚠️ You've used ${Math.round(pct * 100)}% of your monthly action budget. Reset the counter in the workspace header to keep shipping.`,
      })
    }
  }

  const octokit = await getInstallationOctokit(Number(installation.installation_id))
  const [owner, repo] = installation.repo_full_name.split('/')

  const actions = (plan.github_actions as Json[]).map((a) => a as unknown as GithubAction)

  console.log('[executor] plan=%s repo=%s actions=%s', planId, installation.repo_full_name,
    JSON.stringify(actions.map((a) => a.action_type)))

  try {
    for (const action of actions) {
      console.log('[executor] running action=%s', action.action_type)
      await executeAction(octokit, owner, repo, action)
      console.log('[executor] done action=%s', action.action_type)
    }

    await supabase
      .from('plans')
      .update({ status: 'executed', executed_at: new Date().toISOString() })
      .eq('id', planId)
  } catch (err) {
    const status = (err as { status?: number }).status
    const message = githubErrorMessage(status)
    await supabase.from('plans').update({ status: 'failed', error_message: message } as never).eq('id', planId)
    // Rethrow with plain-English message so the approve route can post the channel notification
    throw new Error(message)
  }
}

function githubErrorMessage(status: number | undefined): string {
  if (status === 403) return "GitHub didn't allow the action. Check that the Clan App has the right permissions on your repo."
  if (status === 404) return "The branch or file couldn't be found on GitHub. It may have been deleted."
  return "Something went wrong on GitHub's side. Try again in a minute."
}

async function executeAction(
  octokit: Octokit,
  owner: string,
  repo: string,
  action: GithubAction
): Promise<void> {
  const p = action.payload

  switch (action.action_type) {
    case 'create_issue':
      await octokit.rest.issues.create({
        owner,
        repo,
        title: String(p.title ?? 'New issue'),
        body: String(p.body ?? ''),
        labels: Array.isArray(p.labels) ? p.labels as string[] : [],
      })
      break

    case 'create_pr': {
      // Ensure head branch exists — create from default branch if needed
      const headBranch = String(p.head_branch ?? 'bot/new-pr')
      const title = String(p.title ?? 'New PR')
      const body = String(p.body ?? '')
      const baseBranch = String(p.base_branch ?? 'main')

      // Get default branch SHA to create head branch
      const { data: ref } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`,
      })

      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${headBranch}`,
        sha: ref.object.sha,
      }).catch(() => {
        // Branch already exists — that's fine
      })

      await octokit.rest.pulls.create({
        owner,
        repo,
        title,
        body,
        head: headBranch,
        base: baseBranch,
      })
      break
    }

    case 'comment_pr':
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: Number(p.pr_number),
        body: String(p.body ?? ''),
      })
      break

    case 'comment_issue':
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: Number(p.issue_number),
        body: String(p.body ?? ''),
      })
      break

    case 'commit_file': {
      const filePath = String(p.file_path ?? 'README.md')
      const content = String(p.content ?? '')
      const message = String(p.commit_message ?? `Update ${filePath}`)
      const branch = String(p.branch ?? 'main')

      // Get current file SHA if it exists (required by GitHub for updates)
      let sha: string | undefined
      try {
        const { data: existing } = await octokit.rest.repos.getContent({
          owner, repo, path: filePath, ref: branch,
        })
        if (!Array.isArray(existing) && existing.type === 'file') {
          sha = existing.sha
        }
      } catch {
        // File doesn't exist yet — create it
      }

      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message,
        content: Buffer.from(content).toString('base64'),
        branch,
        ...(sha ? { sha } : {}),
      })
      break
    }
  }
}
