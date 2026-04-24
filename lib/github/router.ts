import { createServiceClient } from '@/lib/supabase/server'

export interface RouteMatch {
  channelId: string
  workspaceId: string
}

/**
 * Given a GitHub installation_id, event_type, and the labels on the payload,
 * returns all matching channel+workspace pairs from github_triggers.
 */
export async function routeGithubEvent(
  installationId: string,
  eventType: string,
  labels: string[]
): Promise<RouteMatch[]> {
  const supabase = createServiceClient()

  // Resolve workspace from installation
  const { data: installation } = await supabase
    .from('github_installations')
    .select('workspace_id')
    .eq('installation_id', installationId)
    .single()

  if (!installation) return []

  const { data: triggers } = await supabase
    .from('github_triggers')
    .select('channel_id')
    .eq('workspace_id', installation.workspace_id)
    .eq('event_type', eventType)

  if (!triggers?.length) return []

  // Apply label filter — if label_filter is set, at least one label must match
  const { data: allTriggers } = await supabase
    .from('github_triggers')
    .select('channel_id, label_filter')
    .eq('workspace_id', installation.workspace_id)
    .eq('event_type', eventType)

  const matched = (allTriggers ?? []).filter((t) => {
    if (!t.label_filter) return true
    return labels.includes(t.label_filter)
  })

  return matched.map((t) => ({
    channelId: t.channel_id,
    workspaceId: installation.workspace_id,
  }))
}

/**
 * Upserts a github_installations row when a GitHub App installation event arrives.
 */
export async function recordInstallation(
  installationId: string,
  workspaceId: string,
  repoFullName: string
): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from('github_installations').upsert(
    { workspace_id: workspaceId, installation_id: installationId, repo_full_name: repoFullName },
    { onConflict: 'installation_id' }
  )
}
