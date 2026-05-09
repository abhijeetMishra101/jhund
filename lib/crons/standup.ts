import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { respondToMessage } from '@/lib/bots'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function runStandup(): Promise<{ workspaces: number }> {
  const supabase = createServiceClient()

  const { data: workspaces } = await supabase.from('workspaces').select('id')
  if (!workspaces?.length) return { workspaces: 0 }

  await Promise.all(workspaces.map((ws) =>
    runStandupForWorkspace(ws.id).catch((err: unknown) => {
      console.error('[standup] workspace=%s error=%s', ws.id, err instanceof Error ? err.message : String(err))
    })
  ))

  return { workspaces: workspaces.length }
}

async function runStandupForWorkspace(workspaceId: string): Promise<void> {
  const supabase = createServiceClient()

  const { data: standupChannel } = await supabase
    .from('channels')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', 'standup')
    .eq('archived', false)
    .single()

  if (!standupChannel) return

  const { data: riley } = await supabase
    .from('bot_roles')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('role_key', 'ops')
    .single()

  // Post Riley's opening message in #standup
  await supabase.from('messages').insert({
    channel_id: standupChannel.id,
    author_type: riley ? 'bot' : 'system',
    author_id: riley ? riley.id : workspaceId,
    content: '📋 Good morning — collecting standup updates from the team. Check back shortly.',
  })

  // Get all active non-ops, non-standup, non-retro bot channels
  const { data: activeChannels } = await supabase
    .from('channels')
    .select('id, name, display_name, bot_role_id')
    .eq('workspace_id', workspaceId)
    .eq('archived', false)
    .neq('name', 'standup')
    .neq('name', 'retrospective')
    .not('bot_role_id', 'is', null)

  if (!activeChannels?.length) return

  const botChannels = activeChannels.filter((ch) => ch.bot_role_id !== riley?.id)
  if (!botChannels.length) return

  // Trigger each bot's standup in its own channel sequentially, collect responses
  const botUpdates: { displayName: string; response: string }[] = []

  for (const ch of botChannels) {
    await supabase.from('messages').insert({
      channel_id: ch.id,
      author_type: 'system',
      author_id: workspaceId,
      content: "It's standup time. What are you working on today? Summarise in 2–3 sentences.",
    })

    await respondToMessage(ch.id, workspaceId).catch((err: unknown) => {
      console.error('[standup] bot response failed channel=%s: %s', ch.id, err instanceof Error ? err.message : String(err))
    })

    // Read the bot's response (the most recent bot message in that channel)
    const { data: latestMsg } = await supabase
      .from('messages')
      .select('content')
      .eq('channel_id', ch.id)
      .eq('author_type', 'bot')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (latestMsg?.content) {
      botUpdates.push({
        displayName: ch.display_name,
        response: latestMsg.content,
      })
    }
  }

  // Riley synthesises all updates into a single digest posted in #standup
  const digest = await buildStandupDigest(botUpdates)

  await supabase.from('messages').insert({
    channel_id: standupChannel.id,
    author_type: riley ? 'bot' : 'system',
    author_id: riley ? riley.id : workspaceId,
    content: digest,
  })

  await supabase
    .from('workspaces')
    .update({ last_standup_at: new Date().toISOString() } as never)
    .eq('id', workspaceId)
}

async function buildStandupDigest(
  updates: { displayName: string; response: string }[]
): Promise<string> {
  if (!updates.length) {
    return "Good morning! The team is quiet today — no standup updates to share. 🌅"
  }

  const updateText = updates
    .map((u) => `${u.displayName}: ${u.response}`)
    .join('\n\n')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: [{
      type: 'text',
      text: "You are Riley, the Ops teammate. Write a brief, warm morning standup digest from the team updates below. Format: one short intro line, then each teammate on their own line starting with their name in bold. Plain English, no jargon, friendly tone. Under 150 words.",
      cache_control: { type: 'ephemeral' },
    }],
    messages: [{
      role: 'user',
      content: `Here are today's standup updates:\n\n${updateText}\n\nWrite the digest.`,
    }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  return textBlock?.type === 'text'
    ? textBlock.text
    : updates.map((u) => `**${u.displayName}**: ${u.response}`).join('\n')
}
