import { NextResponse } from 'next/server'
import { runStandup } from '@/lib/crons/standup'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runStandup()
  return NextResponse.json({ ok: true, workspaces: result.workspaces })
}
