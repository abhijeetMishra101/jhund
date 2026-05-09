import { createServiceClient } from '@/lib/supabase/server'

const DEFAULT_TRIGGERS: Record<
  string,
  {
    channelName: string
    eventType: string
    labelFilter?: string
    chainGroup?: string
    chainType?: 'sequential' | 'parallel'
    chainOrder?: number
  }[]
> = {
  startup: [
    // PR opened → Engineering (Sam) reviews first, then QA (Casey) follows up
    { channelName: 'engineering', eventType: 'pull_request', chainGroup: 'pr-review', chainType: 'sequential', chainOrder: 0 },
    { channelName: 'qa',          eventType: 'pull_request', chainGroup: 'pr-review', chainType: 'sequential', chainOrder: 1 },
    // Security issue → Security (Morgan) + Ops (Riley) notified in parallel
    { channelName: 'security', eventType: 'issues', labelFilter: 'security', chainGroup: 'security-alert', chainType: 'parallel', chainOrder: 0 },
    { channelName: 'ops',      eventType: 'issues', labelFilter: 'security', chainGroup: 'security-alert', chainType: 'parallel', chainOrder: 1 },
    // Bug issues → Engineering only (standalone)
    { channelName: 'engineering', eventType: 'issues', labelFilter: 'bug' },
    // CI failures → Engineering (standalone)
    { channelName: 'engineering', eventType: 'check_run' },
    // Releases → Ops (Riley) (standalone)
    { channelName: 'ops', eventType: 'release' },
  ],
  enterprise: [
    { channelName: 'engineering', eventType: 'pull_request', chainGroup: 'pr-review', chainType: 'sequential', chainOrder: 0 },
    { channelName: 'qa',          eventType: 'pull_request', chainGroup: 'pr-review', chainType: 'sequential', chainOrder: 1 },
    { channelName: 'security', eventType: 'issues', labelFilter: 'security', chainGroup: 'security-alert', chainType: 'parallel', chainOrder: 0 },
    { channelName: 'ops',      eventType: 'issues', labelFilter: 'security', chainGroup: 'security-alert', chainType: 'parallel', chainOrder: 1 },
    { channelName: 'engineering', eventType: 'issues', labelFilter: 'bug' },
    { channelName: 'engineering', eventType: 'check_run' },
    // Release → Engineering summary first, then Product (Alex) follows up
    { channelName: 'engineering', eventType: 'release', chainGroup: 'feature-shipped', chainType: 'sequential', chainOrder: 0 },
    { channelName: 'product',     eventType: 'release', chainGroup: 'feature-shipped', chainType: 'sequential', chainOrder: 1 },
  ],
  blank: [],
}

export async function seedDefaultTriggers(workspaceId: string): Promise<void> {
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('github_triggers')
    .select('id')
    .eq('workspace_id', workspaceId)
    .limit(1)

  if (existing?.length) return

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('template')
    .eq('id', workspaceId)
    .single()

  if (!workspace) return

  const rules = DEFAULT_TRIGGERS[workspace.template] ?? []
  if (!rules.length) return

  const { data: channels } = await supabase
    .from('channels')
    .select('id, name, bot_role_id')
    .eq('workspace_id', workspaceId)

  if (!channels?.length) return

  const channelMap = Object.fromEntries(channels.map((c) => [c.name, c]))

  const triggers = rules.flatMap(({ channelName, eventType, labelFilter, chainGroup, chainType, chainOrder }) => {
    const channel = channelMap[channelName]
    if (!channel?.bot_role_id) return []
    return [{
      workspace_id: workspaceId,
      channel_id: channel.id,
      bot_role_id: channel.bot_role_id,
      event_type: eventType,
      label_filter: labelFilter ?? null,
      chain_group: chainGroup ?? null,
      chain_type: chainType ?? 'parallel',
      chain_order: chainOrder ?? 0,
    }]
  })

  if (!triggers.length) return

  await supabase.from('github_triggers').insert(triggers)
}
