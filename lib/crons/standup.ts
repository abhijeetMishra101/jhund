import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'

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
    .select('id, display_name, system_prompt')
    .eq('workspace_id', workspaceId)
    .eq('role_key', 'ops')
    .single()

  // 1. Riley posts the opening standup message in #standup (top-level)
  const { data: rileyMsg } = await supabase
    .from('messages')
    .insert({
      channel_id: standupChannel.id,
      author_type: riley ? 'bot' : 'system',
      author_id: riley ? riley.id : workspaceId,
      content: '📋 Good morning — collecting standup updates from the team. Check back shortly.',
    })
    .select('id')
    .single()

  const rileyMsgId = rileyMsg?.id ?? null

  // Get all active bots in the workspace (excluding ops/Riley)
  const { data: allBotRoles } = await supabase
    .from('bot_roles')
    .select('id, display_name, system_prompt')
    .eq('workspace_id', workspaceId)
    .neq('role_key', 'ops')

  if (!allBotRoles?.length) {
    await supabase
      .from('workspaces')
      .update({ last_standup_at: new Date().toISOString() } as never)
      .eq('id', workspaceId)
    return
  }

  // 2. Each bot posts their standup update as a thread reply to Riley's opening message
  const botUpdates: { displayName: string; response: string }[] = []

  for (const bot of allBotRoles) {
    // Insert a system prompt to the bot asking for standup update
    const { data: promptMsg } = await supabase
      .from('messages')
      .insert({
        channel_id: standupChannel.id,
        author_type: 'system',
        author_id: workspaceId,
        content: "It's standup time. What are you working on today? Summarise in 2–3 sentences.",
        ...(rileyMsgId ? { parent_id: rileyMsgId } : {}),
      })
      .select('id')
      .single()

    const promptMsgId = promptMsg?.id ?? null

    // Generate bot update via Claude
    let botResponse: string | null = null
    try {
      const claudeResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system: [{ type: 'text', text: bot.system_prompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: "It's standup time. What are you working on today? Summarise in 2–3 sentences." }],
      })
      const textBlock = claudeResponse.content.find((b) => b.type === 'text')
      botResponse = textBlock?.type === 'text' ? textBlock.text.trim() : null
    } catch (err: unknown) {
      console.error('[standup] Claude failed for bot=%s: %s', bot.id, err instanceof Error ? err.message : String(err))
    }

    if (botResponse) {
      // Post bot's update as a thread reply to Riley's opening message
      await supabase.from('messages').insert({
        channel_id: standupChannel.id,
        author_type: 'bot',
        author_id: bot.id,
        content: botResponse,
        ...(rileyMsgId ? { parent_id: rileyMsgId } : {}),
      })

      botUpdates.push({ displayName: bot.display_name, response: botResponse })
    }

    // Clean up prompt message (it was only a vehicle to get bot context)
    if (promptMsgId) {
      await supabase.from('messages').delete().eq('id', promptMsgId)
    }
  }

  // 3. Riley posts a consolidation summary as a final thread reply
  const summary = await buildStandupDigest(botUpdates)

  await supabase.from('messages').insert({
    channel_id: standupChannel.id,
    author_type: riley ? 'bot' : 'system',
    author_id: riley ? riley.id : workspaceId,
    content: summary,
    ...(rileyMsgId ? { parent_id: rileyMsgId } : {}),
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
