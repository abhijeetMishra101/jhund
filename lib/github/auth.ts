import { App } from '@octokit/app'
import { Octokit } from '@octokit/rest'

/** Returns an @octokit/rest instance authenticated as the given installation. */
export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const app = new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  })
  const installationOctokit = await app.getInstallationOctokit(installationId)
  const { token } = await installationOctokit.auth({ type: 'installation' }) as { token: string }
  return new Octokit({ auth: token })
}
