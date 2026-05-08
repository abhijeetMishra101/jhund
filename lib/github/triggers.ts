import { createServiceClient } from '@/lib/supabase/server'

/**
 * Default trigger rules per template.
 * Maps channel name → event_type + optional label_filter.
 * Only seeded once — idempotent (skips if triggers already exist for workspace).
 */
const DEFAULT_TRIGGERS: Record<
  string,
  { channelName: string; eventType: string; labelFilter?: string }[]
> = {
  startup: [
    { channelName: 'engineering', eventType: 'pull_request' },
    { channelName: 'engineering', eventType: 'issues', labelFilter: 'bug' },
    { channelName: 'security',    eventType: 'issues', labelFilter: 'security' },
    { channelName: 'engineering', eventType: 'check_run' },
    { channelName: 'ops',         eventType: 'release' },
  ],
  enterprise: [
    { channelName: 'engineering', eventType: 'pull_request' },
    { channelName: 'engineering', eventType: 'issues', labelFilter: 'bug' },
    { channelName: 'security',    eventType: 'issues', labelFilter: 'security' },
    { channelName: 'engineering', eventType: 'check_run' },
    { channelName: 'ops',         eventType: 'release' },
  ],
  blank: [],
}

/**
 * Seeds default github_triggers for a workspace based on its template.
 * Safe to call multiple times — skips if triggers already exist.
 */
export async function seedDefaultTriggers(workspaceId: string): Promise<void> {
  const supabase = createServiceClient()

  // Check if triggers already seeded
  const { data: existing } = await supabase
    .from('github_triggers')
    .select('id')
    .eq('workspace_id', workspaceId)
    .limit(1)

  if (existing?.length) return

  // Get workspace template
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('template')
    .eq('id', workspaceId)
    .single()

  if (!workspace) return

  const rules = DEFAULT_TRIGGERS[workspace.template] ?? []
  if (!rules.length) return

  // Get channels for this workspace
  const { data: channels } = await supabase
    .from('channels')
    .select('id, name, bot_role_id')
    .eq('workspace_id', workspaceId)

  if (!channels?.length) return

  const channelMap = Object.fromEntries(channels.map((c) => [c.name, c]))

  const triggers = rules.flatMap(({ channelName, eventType, labelFilter }) => {
    const channel = channelMap[channelName]
    if (!channel?.bot_role_id) return []
    return [{
      workspace_id: workspaceId,
      channel_id: channel.id,
      bot_role_id: channel.bot_role_id,
      event_type: eventType,
      label_filter: labelFilter ?? null,
    }]
  })

  if (!triggers.length) return

  await supabase.from('github_triggers').insert(triggers)
}
