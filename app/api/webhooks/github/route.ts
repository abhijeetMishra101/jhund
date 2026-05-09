import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { verifyGithubSignature } from '@/lib/github/verify'
import { summariseEvent, extractLabels } from '@/lib/github/events'
import { routeGithubEvent } from '@/lib/github/router'
import { buildChains, executeChain } from '@/lib/workflow-chain'
import { createServiceClient } from '@/lib/supabase/server'

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
  console.log('[webhook] event:', eventType, '| summary:', summary || '(empty)')
  if (!summary) {
    return NextResponse.json({ ok: true })
  }

  // 4. Route to matching channels via github_triggers (returns ChainSteps)
  const labels = extractLabels(payload)
  const steps = await routeGithubEvent(installationId, eventType, labels)
  console.log('[webhook] matched steps:', steps.length)

  if (!steps.length) {
    return NextResponse.json({ ok: true })
  }

  // 5. Insert system message in every matched channel, then execute chains
  const supabase = createServiceClient()

  waitUntil(
    (async () => {
      // Insert the event summary as a system message in all matched channels
      await Promise.all(
        steps.map(({ channelId, workspaceId }) =>
          supabase.from('messages').insert({
            channel_id: channelId,
            author_type: 'system',
            author_id: workspaceId,
            content: summary,
          })
        )
      )

      // Build chain groups and execute — sequential chains run in order,
      // parallel chains run concurrently, independent triggers run concurrently
      const chains = buildChains(steps)
      await Promise.all(chains.map((chain) => executeChain(chain)))
    })()
  )

  return NextResponse.json({ ok: true })
}
