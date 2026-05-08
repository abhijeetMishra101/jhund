'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

type Template = 'startup' | 'enterprise' | 'blank'
type WorkingStyle = 'hands-off' | 'balanced' | 'hands-on'

const TEMPLATES: { value: Template; label: string; description: string }[] = [
  { value: 'startup', label: 'Startup', description: '5 teammates: Ops, Product, Engineering, Design, Security' },
  { value: 'enterprise', label: 'Enterprise', description: 'Same as Startup — customise after setup' },
  { value: 'blank', label: 'Blank', description: 'Just Ops to start. Hire teammates as you need them.' },
]

const WORKING_STYLES: { value: WorkingStyle; label: string; description: string }[] = [
  { value: 'hands-off', label: 'Hands-off', description: 'Teammates act and report back' },
  { value: 'balanced', label: 'Balanced', description: 'Teammates propose before acting' },
  { value: 'hands-on', label: 'Hands-on', description: 'Approve every step before it happens' },
]

function OnboardingContent() {
  const searchParams = useSearchParams()
  const githubError = searchParams.get('github_error') === '1'
  const githubConnected = searchParams.get('github_connected') === '1'
  const [step, setStep] = useState(githubConnected ? 4 : 1)
  const [companyName, setCompanyName] = useState('')
  const [template, setTemplate] = useState<Template>('startup')
  const [workingStyle, setWorkingStyle] = useState<WorkingStyle>('balanced')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [slug, setSlug] = useState(searchParams.get('workspace') ?? '')

  async function createWorkspace() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/workspace/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: companyName.trim(), template, workingStyle }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Setup failed')
      }
      const data = await res.json()
      setSlug(data.workspace.slug)
      setStep(4)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className={`h-1 flex-1 rounded-full transition-colors ${n <= step ? 'bg-indigo-600' : 'bg-gray-200'}`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400">Step {step} of 5</p>
        </div>

        {/* Step 1: Company name */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">What&apos;s your company called?</h2>
            <p className="text-sm text-gray-500 mb-6">This is how your team will refer to your workspace.</p>
            <input
              type="text"
              autoFocus
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && companyName.trim() && setStep(2)}
              placeholder="Acme Inc."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => setStep(2)}
              disabled={!companyName.trim()}
              className="mt-4 w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Template */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Pick your team</h2>
            <p className="text-sm text-gray-500 mb-6">Choose how many teammates to start with. You can always hire more.</p>
            <div className="space-y-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTemplate(t.value)}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                    template === t.value
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm text-gray-900">{t.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(1)} className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Back
              </button>
              <button onClick={() => setStep(3)} className="flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Working style */}
        {step === 3 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">How do you like to work?</h2>
            <p className="text-sm text-gray-500 mb-6">This sets how much your team checks in before taking action.</p>
            <div className="space-y-3">
              {WORKING_STYLES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setWorkingStyle(s.value)}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                    workingStyle === s.value
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm text-gray-900">{s.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.description}</div>
                </button>
              ))}
            </div>
            {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(2)} className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Back
              </button>
              <button
                onClick={createWorkspace}
                disabled={loading}
                className="flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {loading ? 'Setting up…' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Connect GitHub */}
        {step === 4 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Connect your codebase</h2>
            <p className="text-sm text-gray-500 mb-6">
              Your Engineering teammate can review pull requests and open issues automatically once connected.
            </p>

            {githubError && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                Something went wrong connecting to GitHub. Please try again.
              </div>
            )}

            {githubConnected ? (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-4 flex items-center gap-3 mb-4">
                <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <div className="text-sm font-medium text-green-900">GitHub connected</div>
                  <div className="text-xs text-green-700">Your repo is ready. Teammates can now review pull requests automatically.</div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-4 flex items-center gap-3 mb-4">
                <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">GitHub</div>
                  <div className="text-xs text-gray-500">Choose which repository your team works on</div>
                </div>
                <a
                  href="/api/github/connect"
                  className="text-xs px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-md transition-colors"
                >
                  Connect
                </a>
              </div>
            )}

            {!githubConnected && (
              <p className="text-xs text-gray-400 mb-4">
                You&apos;ll be taken to GitHub to choose a repo. Come back here when done.
              </p>
            )}

            <div className="flex justify-end">
              <button onClick={() => setStep(5)} className="flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                {githubConnected ? 'Continue' : 'Skip for now'}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Meet your team */}
        {step === 5 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Meet your team</h2>
            <p className="text-sm text-gray-500 mb-6">
              Your team is ready. Riley will greet you when you walk in.
            </p>
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-semibold text-indigo-700 shrink-0">
                  R
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-900">Riley</span>
                    <span className="text-xs text-gray-400">Ops</span>
                  </div>
                  <p className="text-sm text-gray-700">
                    Hey! I&apos;m Riley, your Ops teammate. I&apos;m here to keep things running smoothly — routing your questions to the right person, flagging anything urgent, and making sure your team stays on track. What are you working on today?
                  </p>
                </div>
              </div>
            </div>
            <a
              href={`/w/${slug}`}
              className="block w-full text-center py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Go to my workspace →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  )
}
