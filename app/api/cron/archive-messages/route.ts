import { NextResponse } from 'next/server'
import { archiveOldMessages } from '@/lib/crons/archive'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await archiveOldMessages()
  return NextResponse.json({ ok: true, archived: result.archived, workspaces: result.workspaces })
}
