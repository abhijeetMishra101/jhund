/**
 * Converts a raw GitHub webhook payload into a plain-English summary
 * suitable for inserting as a system message in the channel.
 *
 * No technical jargon — the founder reads these.
 */
export function summariseEvent(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case 'pull_request': {
      const action = payload.action as string
      const pr = payload.pull_request as Record<string, unknown>
      const num = pr?.number
      const title = pr?.title as string
      const user = (pr?.user as Record<string, unknown>)?.login as string
      const repo = (payload.repository as Record<string, unknown>)?.name as string

      if (action === 'opened') return `${user} opened pull request #${num} in ${repo}: "${title}"`
      if (action === 'closed') {
        const merged = pr?.merged as boolean
        return merged
          ? `Pull request #${num} was merged into ${repo}: "${title}"`
          : `Pull request #${num} was closed without merging: "${title}"`
      }
      if (action === 'review_requested') return `Review requested on pull request #${num}: "${title}"`
      return `Pull request #${num} ${action}: "${title}"`
    }

    case 'issues': {
      const action = payload.action as string
      const issue = payload.issue as Record<string, unknown>
      const num = issue?.number
      const title = issue?.title as string
      const user = (issue?.user as Record<string, unknown>)?.login as string
      const labels = (issue?.labels as Array<Record<string, unknown>>)
        ?.map((l) => l.name as string)
        .join(', ')
      const repo = (payload.repository as Record<string, unknown>)?.name as string

      if (action === 'opened') {
        const labelStr = labels ? ` [${labels}]` : ''
        return `${user} opened issue #${num} in ${repo}${labelStr}: "${title}"`
      }
      if (action === 'closed') return `Issue #${num} was closed: "${title}"`
      if (action === 'labeled') return `Issue #${num} was labeled "${labels}": "${title}"`
      return `Issue #${num} ${action}: "${title}"`
    }

    case 'issue_comment': {
      const action = payload.action as string
      if (action !== 'created') return ''
      const issue = payload.issue as Record<string, unknown>
      const comment = payload.comment as Record<string, unknown>
      const user = (comment?.user as Record<string, unknown>)?.login as string
      const num = issue?.number
      const body = (comment?.body as string ?? '').slice(0, 120)
      return `${user} commented on #${num}: "${body}${body.length >= 120 ? '…' : ''}"`
    }

    case 'push': {
      const pusher = (payload.pusher as Record<string, unknown>)?.name as string
      const commits = (payload.commits as unknown[])?.length ?? 0
      const branch = (payload.ref as string ?? '').replace('refs/heads/', '')
      const repo = (payload.repository as Record<string, unknown>)?.name as string
      return `${pusher} pushed ${commits} commit${commits !== 1 ? 's' : ''} to ${branch} in ${repo}`
    }

    case 'installation': {
      const action = payload.action as string
      const account = (payload.installation as Record<string, unknown>)
      const login = (account?.account as Record<string, unknown>)?.login as string
      if (action === 'created') return `GitHub connected for ${login}`
      return ''
    }

    default:
      return ''
  }
}

/** Returns the label names on an issue/PR payload, or empty array */
export function extractLabels(payload: Record<string, unknown>): string[] {
  const issue = (payload.issue ?? payload.pull_request) as Record<string, unknown> | undefined
  if (!issue) return []
  return ((issue.labels as Array<Record<string, unknown>>) ?? []).map((l) => l.name as string)
}
