import { gzipSync } from 'zlib'
import { createServiceClient } from '@/lib/supabase/server'

const CHUNK_SIZE = 500
const ARCHIVE_BEFORE_DAYS = 90

export async function archiveOldMessages(): Promise<{ archived: number; workspaces: number }> {
  const supabase = createServiceClient()

  const { data: workspaces } = await supabase.from('workspaces').select('id')
  if (!workspaces?.length) return { archived: 0, workspaces: 0 }

  let totalArchived = 0

  for (const ws of workspaces) {
    const { data: channels } = await supabase
      .from('channels')
      .select('id')
      .eq('workspace_id', ws.id)

    if (!channels?.length) continue

    for (const ch of channels) {
      const count = await archiveChannel(ws.id, ch.id)
      totalArchived += count
    }
  }

  return { archived: totalArchived, workspaces: workspaces.length }
}

async function archiveChannel(workspaceId: string, channelId: string): Promise<number> {
  const supabase = createServiceClient()

  const cutoff = new Date(Date.now() - ARCHIVE_BEFORE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Fetch old messages — exclude any with a pending plan to preserve context
  const { data: messages } = await supabase
    .from('messages')
    .select('id, content, author_type, author_id, created_at, plan_id')
    .eq('channel_id', channelId)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(5000)

  if (!messages?.length) return 0

  // Filter out messages tied to non-null plan_ids to be safe
  const archiveable = messages.filter((m) => !m.plan_id)
  if (!archiveable.length) return 0

  // Group by month for storage path
  const byMonth = new Map<string, typeof archiveable>()
  for (const msg of archiveable) {
    const month = msg.created_at.slice(0, 7) // YYYY-MM
    if (!byMonth.has(month)) byMonth.set(month, [])
    byMonth.get(month)!.push(msg)
  }

  // Upload each month's batch to Supabase Storage
  for (const [month, batch] of Array.from(byMonth)) {
    const path = `archives/${workspaceId}/${channelId}/${month}.json.gz`
    const compressed = gzipSync(Buffer.from(JSON.stringify(batch)))

    const { error: uploadError } = await supabase.storage
      .from('message-archives')
      .upload(path, compressed, { contentType: 'application/gzip', upsert: true })

    if (uploadError) {
      console.error('[archive] upload failed workspace=%s channel=%s month=%s: %s', workspaceId, channelId, month, uploadError.message)
      return 0 // abort channel — do not delete without confirmed upload
    }
  }

  // Delete in chunks of 500
  const ids = archiveable.map((m) => m.id)
  let deleted = 0
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from('messages').delete().in('id', chunk)
    if (error) {
      console.error('[archive] delete failed workspace=%s channel=%s chunk=%d: %s', workspaceId, channelId, i / CHUNK_SIZE, error.message)
      break
    }
    deleted += chunk.length
  }

  console.log('[archive] workspace=%s channel=%s archived=%d rows', workspaceId, channelId, deleted)
  return deleted
}
