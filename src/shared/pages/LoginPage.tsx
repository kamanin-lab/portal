import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'
import { cn } from '@/shared/lib/utils'

type Mode = 'signin' | 'magic' | 'reset'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, signInWithMagicLink, resetPassword, isAuthenticated } = useAuth()

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/inbox'

  if (isAuthenticated) {
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setIsLoading(true)

    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password)
        if (error) {
          setError('E-Mail oder Passwort ungültig.')
        } else {
          navigate(from, { replace: true })
        }
      } else if (mode === 'magic') {
        const { error } = await signInWithMagicLink(email)
        if (error) {
          setError('Magic Link konnte nicht gesendet werden. Bitte erneut versuchen.')
        } else {
          setSuccessMsg('Magic Link wurde an Ihre E-Mail gesendet. Bitte prüfen Sie Ihr Postfach.')
        }
      } else if (mode === 'reset') {
        const { error } = await resetPassword(email)
        if (error) {
          setError('Passwort-Reset fehlgeschlagen. Bitte erneut versuchen.')
        } else {
          setSuccessMsg('Passwort-Reset-Link wurde an Ihre E-Mail gesendet.')
        }
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-10 h-10 rounded-[10px] bg-accent flex items-center justify-center mb-3">
            <span className="text-white font-bold text-base">K</span>
          </div>
          <h1 className="text-xl font-semibold text-text-primary">KAMANIN Portal</h1>
          <p className="text-text-tertiary text-sm mt-1">Ihr Projektportal</p>
        </div>

        {/* Card */}
        <div className="bg-surface rounded-[14px] border border-border p-6 shadow-md">
          {mode === 'signin' && (
            <h2 className="text-base font-semibold text-text-primary mb-5">Anmelden</h2>
          )}
          {mode === 'magic' && (
            <h2 className="text-base font-semibold text-text-primary mb-5">Magic Link</h2>
          )}
          {mode === 'reset' && (
            <h2 className="text-base font-semibold text-text-primary mb-5">Passwort zurücksetzen</h2>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary" htmlFor="email">
                E-Mail-Adresse
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@firma.de"
                className="h-10 px-3 rounded-[8px] border border-border bg-bg text-text-primary text-sm outline-none focus:border-accent transition-colors"
              />
            </div>

            {mode === 'signin' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary" htmlFor="password">
                  Passwort
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 px-3 rounded-[8px] border border-border bg-bg text-text-primary text-sm outline-none focus:border-accent transition-colors"
                />
              </div>
            )}

            {error && (
              <p className="text-xs text-awaiting bg-awaiting-bg px-3 py-2 rounded-[8px]">{error}</p>
            )}
            {successMsg && (
              <p className="text-xs text-committed bg-committed-bg px-3 py-2 rounded-[8px]">{successMsg}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                'h-10 rounded-[8px] bg-accent text-white text-sm font-semibold transition-colors',
                'hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed'
              )}
            >
              {isLoading
                ? 'Bitte warten…'
                : mode === 'signin'
                  ? 'Anmelden'
                  : mode === 'magic'
                    ? 'Magic Link senden'
                    : 'Link senden'}
            </button>
          </form>

          {/* Mode switchers */}
          <div className="mt-4 flex flex-col gap-2">
            {mode === 'signin' && (
              <>
                <button
                  type="button"
                  onClick={() => { setMode('magic'); setError(null); setSuccessMsg(null) }}
                  className="text-xs text-accent hover:underline text-center"
                >
                  Mit Magic Link anmelden
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('reset'); setError(null); setSuccessMsg(null) }}
                  className="text-xs text-text-tertiary hover:text-text-secondary text-center"
                >
                  Passwort vergessen?
                </button>
              </>
            )}
            {(mode === 'magic' || mode === 'reset') && (
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(null); setSuccessMsg(null) }}
                className="text-xs text-accent hover:underline text-center"
              >
                ← Zurück zur Anmeldung
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
