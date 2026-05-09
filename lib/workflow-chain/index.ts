import { createServiceClient } from '@/lib/supabase/server'
import { respondToMessage } from '@/lib/bots'

export interface ChainStep {
  channelId: string
  workspaceId: string
  chainGroup: string | null
  chainType: 'sequential' | 'parallel'
  chainOrder: number
}

/**
 * Groups trigger matches into chains ordered for execution.
 * Steps with the same chain_group are grouped together.
 * Steps with chain_group=null are treated as independent single-step chains.
 * Within each sequential group, steps are sorted by chain_order ascending.
 */
export function buildChains(steps: ChainStep[]): ChainStep[][] {
  const groups = new Map<string, ChainStep[]>()
  const standalone: ChainStep[][] = []

  for (const step of steps) {
    if (!step.chainGroup) {
      standalone.push([step])
      continue
    }
    if (!groups.has(step.chainGroup)) groups.set(step.chainGroup, [])
    groups.get(step.chainGroup)!.push(step)
  }

  const chains: ChainStep[][] = [...standalone]
  for (const group of Array.from(groups.values())) {
    chains.push(group.sort((a, b) => a.chainOrder - b.chainOrder))
  }

  return chains
}

/**
 * Executes a single chain.
 *
 * Parallel chain (all steps share chain_type='parallel'):
 *   All bots triggered concurrently via Promise.all.
 *
 * Sequential chain (chain_type='sequential'):
 *   Bots run in chain_order order. Before each step after the first,
 *   a handoff announcement is posted in the receiving channel so the
 *   founder sees the handoff happening.
 */
export async function executeChain(steps: ChainStep[]): Promise<void> {
  if (!steps.length) return

  const isParallel = steps[0].chainType === 'parallel'

  if (isParallel) {
    await Promise.all(
      steps.map((step) =>
        respondToMessage(step.channelId, step.workspaceId).catch((err: unknown) => {
          console.error('[chain] parallel step failed channel=%s: %s', step.channelId, err instanceof Error ? err.message : String(err))
        })
      )
    )
    return
  }

  // Sequential — run in order, post handoff announcements between steps
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const prev = steps[i - 1]

    if (i > 0 && prev) {
      await postHandoffAnnouncement(step.channelId, step.workspaceId, prev.channelId)
    }

    await respondToMessage(step.channelId, step.workspaceId).catch((err: unknown) => {
      console.error('[chain] sequential step failed channel=%s order=%d: %s', step.channelId, step.chainOrder, err instanceof Error ? err.message : String(err))
    })
  }
}

async function postHandoffAnnouncement(
  toChannelId: string,
  workspaceId: string,
  fromChannelId: string
): Promise<void> {
  const supabase = createServiceClient()

  const [{ data: toChannel }, { data: fromChannel }] = await Promise.all([
    supabase.from('channels').select('display_name').eq('id', toChannelId).single(),
    supabase.from('channels').select('display_name').eq('id', fromChannelId).single(),
  ])

  const from = fromChannel?.display_name ?? 'the previous step'
  const to = toChannel?.display_name ?? 'the next teammate'

  await supabase.from('messages').insert({
    channel_id: toChannelId,
    author_type: 'system',
    author_id: workspaceId,
    content: `📨 ${from} finished — passing to ${to}.`,
  })
}
