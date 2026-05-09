import { createServiceClient } from '@/lib/supabase/server'
import { respondToMessage } from '@/lib/bots'

export async function runStandup(): Promise<{ workspaces: number }> {
  const supabase = createServiceClient()

  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id')

  if (!workspaces?.length) return { workspaces: 0 }

  await Promise.all(workspaces.map((ws) => runStandupForWorkspace(ws.id).catch((err: unknown) => {
    console.error('[standup] workspace=%s error=%s', ws.id, err instanceof Error ? err.message : String(err))
  })))

  return { workspaces: workspaces.length }
}

async function runStandupForWorkspace(workspaceId: string): Promise<void> {
  const supabase = createServiceClient()

  // Find #standup channel
  const { data: standupChannel } = await supabase
    .from('channels')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', 'standup')
    .eq('archived', false)
    .single()

  if (!standupChannel) return

  // Find Riley (ops bot)
  const { data: riley } = await supabase
    .from('bot_roles')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('role_key', 'ops')
    .single()

  // Post opening message in #standup
  await supabase.from('messages').insert({
    channel_id: standupChannel.id,
    author_type: riley ? 'bot' : 'system',
    author_id: riley ? riley.id : workspaceId,
    content: '📋 Good morning — time for your daily standup. Check each channel for updates from your team.',
  })

  // Trigger each active non-ops bot in its own channel
  const { data: activeChannels } = await supabase
    .from('channels')
    .select('id, bot_role_id')
    .eq('workspace_id', workspaceId)
    .eq('archived', false)
    .neq('name', 'standup')
    .neq('name', 'retrospective')
    .not('bot_role_id', 'is', null)

  if (!activeChannels?.length) return

  // Filter out ops channel
  const { data: opsBot } = await supabase
    .from('bot_roles')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('role_key', 'ops')
    .single()

  const botChannels = activeChannels.filter((ch) => ch.bot_role_id !== opsBot?.id)

  await Promise.all(
    botChannels.map(async (ch) => {
      // Insert a standup prompt as a system message so the bot has context
      await supabase.from('messages').insert({
        channel_id: ch.id,
        author_type: 'system',
        author_id: workspaceId,
        content: "It's standup time. What are you working on today? Summarise in 2–3 sentences.",
      })
      await respondToMessage(ch.id, workspaceId).catch((err: unknown) => {
        console.error('[standup] bot response failed channel=%s: %s', ch.id, err instanceof Error ? err.message : String(err))
      })
    })
  )

  // Update last_standup_at
  await supabase
    .from('workspaces')
    .update({ last_standup_at: new Date().toISOString() } as never)
    .eq('id', workspaceId)
}
