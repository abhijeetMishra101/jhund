interface GithubActionInput {
  action_type: string
  payload: Record<string, unknown>
}

/**
 * Server-side auto-approve allowlist.
 *
 * Returns true only when ALL of the following rules pass:
 *   1. Every action is commit_file or patch_github_file (no PRs, issues, or comments)
 *   2. At most 3 actions in the batch (prevents bulk auto-rewrites)
 *   3. Every file_path is in the safe-path whitelist:
 *      docs/, __tests__/, *.test.ts, *.test.js, *.spec.ts, *.spec.js, *.md
 *   4. Every branch starts with 'bot/'
 *
 * The bot's `confidence` field is advisory only — this function is the
 * authoritative check. If it returns false the action falls back to normal
 * plan-approval regardless of what Claude declared.
 */
export function isAutoApprovable(actions: GithubActionInput[]): boolean {
  // Rule 1: only commit_file or patch_github_file (no PRs, issues, comments)
  if (actions.some(a => a.action_type !== 'commit_file' && a.action_type !== 'patch_github_file')) return false

  // Rule 2: max 3 files
  if (actions.length > 3) return false

  // Rule 3: file path must be in safe whitelist
  const safePaths = [/^docs\//, /^__tests__\//, /\.(test|spec)\.(ts|js|tsx|jsx)$/, /\.md$/]
  if (!actions.every(a => safePaths.some(re => re.test(String(a.payload.file_path ?? ''))))) return false

  // Rule 4: branch must start with 'bot/'
  if (!actions.every(a => String(a.payload.branch ?? '').startsWith('bot/'))) return false

  return true
}
