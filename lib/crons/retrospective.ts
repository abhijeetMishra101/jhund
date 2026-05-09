import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function runRetrospective(): Promise<{ workspaces: number }> {
  const supabase = createServiceClient()

  const { data: workspaces } = await supabase.from('workspaces').select('id')
  if (!workspaces?.length) return { workspaces: 0 }

  await Promise.all(workspaces.map((ws) =>
    runRetroForWorkspace(ws.id).catch((err: unknown) => {
      console.error('[retro] workspace=%s error=%s', ws.id, err instanceof Error ? err.message : String(err))
    })
  ))

  return { workspaces: workspaces.length }
}

async function runRetroForWorkspace(workspaceId: string): Promise<void> {
  const supabase = createServiceClient()

  // Find #retrospective channel
  const { data: retroChannel } = await supabase
    .from('channels')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', 'retrospective')
    .eq('archived', false)
    .single()

  if (!retroChannel) return

  // Find Riley
  const { data: riley } = await supabase
    .from('bot_roles')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('role_key', 'ops')
    .single()

  // Fetch last 7 days of non-system messages
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('content, author_type, created_at')
    .eq('workspace_id' as never, workspaceId)
    .neq('author_type', 'system')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200)

  let summary: string

  if (!recentMessages?.length) {
    summary = "It's been a quiet week — no activity to reflect on. A fresh start for next week! 🌱"
  } else {
    const transcript = recentMessages
      .map((m) => `[${m.author_type}] ${m.content}`)
      .join('\n')

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: [{
        type: 'text',
        text: 'You are Riley, the Ops teammate. Write a brief, warm weekly retrospective based on team activity. Cover: what went well, what was challenging, what\'s coming up. Under 200 words. Plain English — no jargon, no bullet-point lists, just flowing sentences.',
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role: 'user',
        content: `Here is the team activity from the past week:\n\n${transcript}\n\nWrite the retrospective.`,
      }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    summary = textBlock?.type === 'text' ? textBlock.text : "Wrapping up the week — great effort from everyone. 🙌"
  }

  await supabase.from('messages').insert({
    channel_id: retroChannel.id,
    author_type: riley ? 'bot' : 'system',
    author_id: riley ? riley.id : workspaceId,
    content: summary,
  })

  await supabase
    .from('workspaces')
    .update({ last_retro_at: new Date().toISOString() } as never)
    .eq('id', workspaceId)
}
