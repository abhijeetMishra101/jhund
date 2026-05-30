import type { Octokit } from '@octokit/rest'

const MAX_CONTEXT_CHARS = 3000
const README_MAX_CHARS = 1500

/**
 * Reads README.md + package.json from a GitHub repo and synthesises a
 * plain-English project description suitable for injection into bot system prompts.
 *
 * Returns null if README is missing or unreadable — callers should handle this
 * gracefully (Ops bot nudge, etc.) rather than throwing.
 *
 * Never throws — all errors are caught and logged. A failed derivation should
 * never block a GitHub connect flow.
 */
export async function deriveWorkspaceContext(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<string | null> {
  try {
    // --- README ---
    let readmeText: string | null = null
    try {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path: 'README.md' })
      if (!Array.isArray(data) && data.type === 'file' && data.content) {
        const decoded = Buffer.from(data.content, 'base64').toString('utf8')
        readmeText = decoded.slice(0, README_MAX_CHARS)
      }
    } catch {
      // README missing or inaccessible — not a blocker
    }

    if (!readmeText) return null

    // --- package.json (optional) ---
    let projectName = repo
    let projectDescription = ''
    const detectedStack: string[] = []

    try {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path: 'package.json' })
      if (!Array.isArray(data) && data.type === 'file' && data.content) {
        const pkg = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')) as Record<string, unknown>

        if (typeof pkg.name === 'string' && pkg.name) projectName = pkg.name
        if (typeof pkg.description === 'string' && pkg.description) projectDescription = pkg.description

        const deps = {
          ...((pkg.dependencies as Record<string, unknown>) ?? {}),
          ...((pkg.devDependencies as Record<string, unknown>) ?? {}),
        }

        const STACK_SIGNALS: Array<[string, string]> = [
          ['next', 'Next.js'],
          ['react', 'React'],
          ['@supabase/supabase-js', 'Supabase'],
          ['@anthropic-ai/sdk', 'Anthropic Claude SDK'],
          ['prisma', 'Prisma'],
          ['drizzle-orm', 'Drizzle ORM'],
          ['tailwindcss', 'Tailwind CSS'],
          ['typescript', 'TypeScript'],
          ['vitest', 'Vitest'],
          ['jest', 'Jest'],
          ['express', 'Express'],
          ['fastify', 'Fastify'],
          ['trpc', 'tRPC'],
          ['@trpc/server', 'tRPC'],
        ]

        for (const [depKey, label] of STACK_SIGNALS) {
          if (deps[depKey] !== undefined && !detectedStack.includes(label)) {
            detectedStack.push(label)
          }
        }
      }
    } catch {
      // package.json missing — fine, use README only
    }

    // --- Synthesise ---
    const lines: string[] = []
    lines.push(`Project: ${projectName}`)
    if (projectDescription) lines.push(projectDescription)
    if (detectedStack.length > 0) lines.push(`Stack: ${detectedStack.join(', ')}`)
    lines.push(`GitHub repo: ${owner}/${repo}`)
    lines.push('')
    lines.push(readmeText.trim())

    const context = lines.join('\n').slice(0, MAX_CONTEXT_CHARS)
    return context
  } catch (err) {
    console.error('[derive-context] unexpected error owner=%s repo=%s err=%s', owner, repo, String(err))
    return null
  }
}
