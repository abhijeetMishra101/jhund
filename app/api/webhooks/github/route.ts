import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { verifyGithubSignature } from '@/lib/github/verify'
import { summariseEvent, extractLabels } from '@/lib/github/events'
import { routeGithubEvent } from '@/lib/github/router'
import { createServiceClient } from '@/lib/supabase/server'
import { respondToMessage } from '@/lib/bots'

export async function POST(request: Request) {
  // 1. Read raw body BEFORE any parsing
  const rawBody = Buffer.from(await request.arrayBuffer())

  // 2. Verify HMAC-SHA256 signature — reject immediately if invalid
  const signature = request.headers.get('x-hub-signature-256')
  if (!verifyGithubSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const eventType = request.headers.get('x-github-event') ?? ''
  const payload = JSON.parse(rawBody.toString('utf-8')) as Record<string, unknown>
  const installationId = String(
    (payload.installation as Record<string, unknown>)?.id ?? ''
  )

  // 3. Summarise the event in plain English
  const summary = summariseEvent(eventType, payload)
  if (!summary) {
    // Event type we don't handle — acknowledge and exit
    return NextResponse.json({ ok: true })
  }

  // 4. Route to matching channels via github_triggers
  const labels = extractLabels(payload)
  const matches = await routeGithubEvent(installationId, eventType, labels)

  if (!matches.length) {
    return NextResponse.json({ ok: true })
  }

  // 5. For each matched channel: insert a system message then trigger bot
  const supabase = createServiceClient()

  waitUntil(
    Promise.all(
      matches.map(async ({ channelId, workspaceId }) => {
        // Insert the plain-English GitHub event as a system message
        const { data: msg } = await supabase
          .from('messages')
          .insert({
            channel_id: channelId,
            author_type: 'system',
            author_id: installationId,
            content: summary,
          })
          .select('id')
          .single()

        if (!msg) return

        // Trigger the bot to respond to the event
        await respondToMessage(channelId, workspaceId).catch((err: unknown) => {
          console.error('[webhook] bot response failed:', err)
        })
      })
    )
  )

  return NextResponse.json({ ok: true })
}
