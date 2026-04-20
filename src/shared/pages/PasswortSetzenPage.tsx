import { useState, useEffect, useRef, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { validatePassword } from '@/shared/lib/password-validation'
import { PasswordChecklist } from '@/shared/components/common/PasswordChecklist'
import logo from '@/assets/KAMANIN-icon-colour.svg'

export function PasswortSetzenPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    }
  }, [])

  // No token → show invalid link state immediately
  if (!token) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-[400px]">
          <div className="flex flex-col items-center mb-8">
            <img src={logo} alt="KAMANIN" className="h-14 w-auto mb-3" />
            <p className="text-text-tertiary text-sm">Ihr Projektportal</p>
          </div>
          <div className="bg-surface rounded-[14px] border border-border p-6 shadow-md">
            <h2 className="text-base font-semibold text-text-primary mb-3">Ungültiger oder fehlender Link</h2>
            <p className="text-sm text-text-secondary mb-4">
              Dieser Link ist ungültig oder unvollständig. Bitte wenden Sie sich an Ihren Administrator für eine neue Einladung.
            </p>
            <Link to="/login" className="text-sm text-accent hover:underline">Zur Anmeldung</Link>
          </div>
        </div>
      </div>
    )
  }

  const trimmedName = fullName.trim()
  const passwordsMatch = password === confirm
  const { valid: passwordValid } = validatePassword(password)
  const canSubmit = trimmedName.length >= 2 && passwordsMatch && passwordValid && !submitting

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)

    // Step 1: Verify the OTP token (exchanges token for a session)
    // token is guaranteed non-null here (early return above guards against it)
    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: token as string,
      type: 'recovery',
    })
    if (otpError) {
      setSubmitting(false)
      setError('Link abgelaufen oder ungültig. Bitte fordern Sie eine neue Einladung an.')
      return
    }

    // Step 2: Now that we have a session, update the password
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (updateError) {
      setError('Passwort konnte nicht gesetzt werden. Bitte erneut versuchen.')
      return
    }

    // Step 3: Persist full name to profile (non-fatal — password is already set)
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (userData?.user?.id) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ full_name: trimmedName })
          .eq('id', userData.user.id)
        if (profileError) {
          console.error('Profile name update failed (non-fatal):', profileError)
        }
      }
    } catch (e) {
      console.error('Profile name update failed (non-fatal):', e)
    }

    setSuccess(true)
    // Short delay so user sees success state before redirect
    redirectTimer.current = setTimeout(() => navigate('/tickets', { replace: true }), 800)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-[400px]">
          <div className="flex flex-col items-center mb-8">
            <img src={logo} alt="KAMANIN" className="h-14 w-auto mb-3" />
            <p className="text-text-tertiary text-sm">Ihr Projektportal</p>
          </div>
          <div className="bg-surface rounded-[14px] border border-border p-6 shadow-md text-center">
            <h2 className="text-base font-semibold text-text-primary mb-3">Passwort gesetzt</h2>
            <p className="text-sm text-text-secondary">Sie werden jetzt weitergeleitet...</p>
          </div>
        </div>
      </div>
    )
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
              <label className="text-xs font-medium text-text-secondary" htmlFor="full-name">
                Vollständiger Name
              </label>
              <input
                id="full-name"
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Max Mustermann"
                maxLength={100}
                className="h-10 px-3 rounded-[8px] border border-border bg-bg text-text-primary text-sm outline-none focus:border-accent transition-colors"
              />
            </div>
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
                className="h-10 px-3 rounded-[8px] border border-border bg-bg text-text-primary text-sm outline-none focus:border-accent transition-colors"
              />
            </div>
            <PasswordChecklist password={password} />
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
              {submitting ? 'Bitte warten...' : 'Passwort festlegen'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
