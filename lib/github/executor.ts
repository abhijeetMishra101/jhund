import { App } from '@octokit/app'
import { Octokit } from '@octokit/rest'
import { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/types'

interface GithubAction {
  action_type: 'create_pr' | 'create_issue' | 'comment_pr' | 'comment_issue'
  payload: Record<string, unknown>
}

/**
 * Executes all github_actions from a plan row using the GitHub App installation token.
 * Requires the workspace to have a linked github_installations row.
 */
export async function executePlanActions(planId: string, workspaceId: string): Promise<void> {
  const supabase = createServiceClient()

  // Fetch plan + its actions
  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('github_actions')
    .eq('id', planId)
    .single()

  if (planError || !plan) throw new Error(`Plan not found: ${planError?.message ?? ''}`)

  // Resolve the GitHub installation for this workspace
  const { data: installation } = await supabase
    .from('github_installations')
    .select('installation_id, repo_full_name')
    .eq('workspace_id', workspaceId)
    .single()

  if (!installation) {
    throw new Error('No GitHub installation linked to this workspace')
  }

  const app = new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  })

  // Get an installation token then use @octokit/rest which includes all REST endpoints
  const installationOctokit = await app.getInstallationOctokit(Number(installation.installation_id))
  const { token } = await installationOctokit.auth({ type: 'installation' }) as { token: string }
  const octokit = new Octokit({ auth: token })
  const [owner, repo] = installation.repo_full_name.split('/')

  const actions = (plan.github_actions as Json[]).map((a) => a as unknown as GithubAction)

  for (const action of actions) {
    await executeAction(octokit, owner, repo, action)
  }

  // Mark plan as executed
  await supabase
    .from('plans')
    .update({ status: 'executed', executed_at: new Date().toISOString() })
    .eq('id', planId)
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
  }
}
