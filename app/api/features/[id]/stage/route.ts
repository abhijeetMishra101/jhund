import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkGate, advanceStage } from '@/lib/feature-stages'
import type { GateType } from '@/lib/feature-stages'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { to_stage, gate_type, actor_role, notes } = body as Record<string, unknown>

  if (typeof to_stage !== 'number') {
    return NextResponse.json({ error: 'to_stage is required and must be a number' }, { status: 400 })
  }
  if (!gate_type || typeof gate_type !== 'string') {
    return NextResponse.json({ error: 'gate_type is required' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: userRow } = await db
    .from('users')
    .select('workspace_id')
    .eq('id', user.id)
    .single()

  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Anti-IDOR: verify feature belongs to user's workspace
  const { data: feature, error: featureError } = await db
    .from('features')
    .select('id, stage')
    .eq('id', id)
    .eq('workspace_id', userRow.workspace_id)
    .single()

  if (featureError || !feature) {
    return NextResponse.json({ error: 'Feature not found' }, { status: 404 })
  }

  // Check gate before advancing
  const gateResult = await checkGate(id, feature.stage as number)
  if (!gateResult.cleared) {
    return NextResponse.json(
      { error: gateResult.reason, gate_blocked: true },
      { status: 409 }
    )
  }

  try {
    await advanceStage(
      id,
      to_stage,
      gate_type as GateType,
      actor_role as string | undefined,
      notes as string | undefined
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to advance stage'
    return NextResponse.json({ error: message, gate_blocked: true }, { status: 409 })
  }

  return NextResponse.json({ ok: true, stage: to_stage })
}
