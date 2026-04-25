import { describe, it, expect } from 'vitest'
import { summariseEvent, extractLabels } from '@/lib/github/events'

const repo = { name: 'my-repo' }
const user = { login: 'alice' }

describe('summariseEvent — pull_request', () => {
  const pr = { number: 42, title: 'Add feature', user, merged: false }

  it('opened', () => {
    const out = summariseEvent('pull_request', { action: 'opened', pull_request: pr, repository: repo })
    expect(out).toBe('alice opened pull request #42 in my-repo: "Add feature"')
  })

  it('closed without merge', () => {
    const out = summariseEvent('pull_request', { action: 'closed', pull_request: { ...pr, merged: false }, repository: repo })
    expect(out).toContain('closed without merging')
  })

  it('closed with merge', () => {
    const out = summariseEvent('pull_request', { action: 'closed', pull_request: { ...pr, merged: true }, repository: repo })
    expect(out).toContain('merged into')
  })

  it('review_requested', () => {
    const out = summariseEvent('pull_request', { action: 'review_requested', pull_request: pr, repository: repo })
    expect(out).toContain('Review requested')
  })

  it('other actions fall through to generic', () => {
    const out = summariseEvent('pull_request', { action: 'synchronize', pull_request: pr, repository: repo })
    expect(out).toContain('synchronize')
  })
})

describe('summariseEvent — issues', () => {
  const issue = { number: 7, title: 'Bug found', user, labels: [] }

  it('opened with no labels', () => {
    const out = summariseEvent('issues', { action: 'opened', issue, repository: repo })
    expect(out).toBe('alice opened issue #7 in my-repo: "Bug found"')
  })

  it('opened with labels', () => {
    const withLabels = { ...issue, labels: [{ name: 'bug' }, { name: 'urgent' }] }
    const out = summariseEvent('issues', { action: 'opened', issue: withLabels, repository: repo })
    expect(out).toContain('[bug, urgent]')
  })

  it('closed', () => {
    const out = summariseEvent('issues', { action: 'closed', issue, repository: repo })
    expect(out).toContain('closed')
    expect(out).toContain('#7')
  })

  it('labeled', () => {
    const labeled = { ...issue, labels: [{ name: 'security' }] }
    const out = summariseEvent('issues', { action: 'labeled', issue: labeled, repository: repo })
    expect(out).toContain('labeled')
    expect(out).toContain('security')
  })

  it('assigned falls through to generic action summary', () => {
    const out = summariseEvent('issues', {
      action: 'assigned',
      issue: { number: 3, title: 'X', user: { login: 'bob' }, labels: [] },
      repository: { name: 'repo' },
    })
    expect(out).toContain('assigned')
  })
})

describe('summariseEvent — issue_comment', () => {
  const issue = { number: 5 }
  const comment = { user, body: 'Looks good to me' }

  it('created → returns summary', () => {
    const out = summariseEvent('issue_comment', { action: 'created', issue, comment })
    expect(out).toBe('alice commented on #5: "Looks good to me"')
  })

  it('edited → returns empty (not routed)', () => {
    const out = summariseEvent('issue_comment', { action: 'edited', issue, comment })
    expect(out).toBe('')
  })

  it('truncates long comments at 120 chars', () => {
    const longBody = 'x'.repeat(200)
    const out = summariseEvent('issue_comment', { action: 'created', issue, comment: { user, body: longBody } })
    expect(out).toContain('…')
  })
})

describe('summariseEvent — push', () => {
  it('single commit', () => {
    const out = summariseEvent('push', {
      pusher: { name: 'bob' },
      commits: [{}],
      ref: 'refs/heads/main',
      repository: repo,
    })
    expect(out).toBe('bob pushed 1 commit to main in my-repo')
  })

  it('multiple commits', () => {
    const out = summariseEvent('push', {
      pusher: { name: 'bob' },
      commits: [{}, {}, {}],
      ref: 'refs/heads/feat/x',
      repository: repo,
    })
    expect(out).toContain('3 commits')
    expect(out).toContain('feat/x')
  })
})

describe('summariseEvent — installation', () => {
  it('created → returns connection message', () => {
    const out = summariseEvent('installation', {
      action: 'created',
      installation: { account: { login: 'acme-corp' } },
    })
    expect(out).toBe('GitHub connected for acme-corp')
  })

  it('deleted → returns empty', () => {
    const out = summariseEvent('installation', {
      action: 'deleted',
      installation: { account: { login: 'acme-corp' } },
    })
    expect(out).toBe('')
  })
})

describe('summariseEvent — unknown event', () => {
  it('returns empty string', () => {
    expect(summariseEvent('workflow_run', {})).toBe('')
  })
})

describe('extractLabels', () => {
  it('extracts labels from an issue payload', () => {
    const labels = extractLabels({
      issue: { labels: [{ name: 'bug' }, { name: 'help wanted' }] },
    })
    expect(labels).toEqual(['bug', 'help wanted'])
  })

  it('extracts labels from a pull_request payload', () => {
    const labels = extractLabels({
      pull_request: { labels: [{ name: 'security' }] },
    })
    expect(labels).toEqual(['security'])
  })

  it('returns empty array when no labels', () => {
    expect(extractLabels({ issue: { labels: [] } })).toEqual([])
  })

  it('returns empty array when no issue or pr', () => {
    expect(extractLabels({})).toEqual([])
  })
})
