import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'
import logo from '@/assets/KAMANIN-icon-colour.svg'

export function PasswortSetzenPage() {
  const { session, isLoading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [verifying, setVerifying] = useState(false)

  // Invite flow: ?token=HASH&type=recovery — verify OTP directly, no GoTrue redirect needed
  useEffect(() => {
    const token = searchParams.get('token')
    const type = searchParams.get('type')
    if (!token || type !== 'recovery') return
    setVerifying(true)
    supabase.auth.verifyOtp({ token_hash: token, type: 'recovery' }).then(({ error }) => {
      if (error) setError('Dieser Einladungslink ist abgelaufen oder ungültig.')
      setVerifying(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || verifying) {
    return <div className="min-h-screen bg-bg flex items-center justify-center p-4" />
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-[400px]">
          <div className="flex flex-col items-center mb-8">
            <img src={logo} alt="KAMANIN" className="h-14 w-auto mb-3" />
            <p className="text-text-tertiary text-sm">Ihr Projektportal</p>
          </div>
          <div className="bg-surface rounded-[14px] border border-border p-6 shadow-md">
            <h2 className="text-base font-semibold text-text-primary mb-3">Link abgelaufen</h2>
            <p className="text-sm text-text-secondary mb-4">
              {error ?? 'Dieser Einladungslink ist abgelaufen oder ungültig. Bitte wenden Sie sich an Ihren Administrator für eine neue Einladung.'}
            </p>
            <Link to="/login" className="text-sm text-accent hover:underline">Zur Anmeldung</Link>
          </div>
        </div>
      </div>
    )
  }

  const passwordsMatch = password === confirm
  const passwordValid = password.length >= 8
  const canSubmit = passwordsMatch && passwordValid && !submitting

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)
    const { error: updateError } = await updatePassword(password)
    setSubmitting(false)
    if (updateError) {
      setError('Passwort konnte nicht gesetzt werden. Bitte erneut versuchen.')
      return
    }
    navigate('/tickets', { replace: true })
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="KAMANIN" className="h-14 w-auto mb-3" />
          <p className="text-text-tertiary text-sm">Ihr Projektportal</p>
        </div>
        <div className="bg-surface rounded-[14px] border border-border p-6 shadow-md">
          <h2 className="text-base font-semibold text-text-primary mb-5">Passwort festlegen</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary" htmlFor="new-password">
                Neues Passwort
              </label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                className="h-10 px-3 rounded-[8px] border border-border bg-bg text-text-primary text-sm outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary" htmlFor="confirm-password">
                Passwort bestätigen
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                minLength={8}
                className="h-10 px-3 rounded-[8px] border border-border bg-bg text-text-primary text-sm outline-none focus:border-accent transition-colors"
              />
            </div>
            {password && confirm && !passwordsMatch && (
              <p className="text-xs text-awaiting bg-awaiting-bg px-3 py-2 rounded-[8px]">
                Passwörter stimmen nicht überein.
              </p>
            )}
            {error && (
              <p className="text-xs text-awaiting bg-awaiting-bg px-3 py-2 rounded-[8px]">{error}</p>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-10 rounded-[8px] bg-accent text-white text-sm font-semibold transition-colors hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Bitte warten…' : 'Passwort festlegen'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
