import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { LockIcon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { validatePassword } from '@/shared/lib/password-validation'
import { PasswordChecklist } from '@/shared/components/common/PasswordChecklist'
import { useUpdatePassword } from '@/shared/hooks/useUpdateProfile'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'

export function PasswordSection() {
  const [searchParams] = useSearchParams()
  const [isEditing, setIsEditing] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const updatePassword = useUpdatePassword()

  // Auto-open form when redirected from password recovery link
  useEffect(() => {
    if (searchParams.get('action') === 'change-password') {
      setIsEditing(true)
    }
  }, [searchParams])

  const { valid } = validatePassword(password)
  const passwordsMatch = password.trim() !== '' && password.trim() === confirmPassword.trim()
  const canSubmit = valid && passwordsMatch && !updatePassword.isPending

  const handleSave = () => {
    if (!valid) {
      toast.error('Passwort erfüllt nicht alle Anforderungen.')
      return
    }
    if (!passwordsMatch) {
      toast.error('Passwörter stimmen nicht überein.')
      return
    }
    updatePassword.mutate(password.trim(), {
      onSuccess: () => {
        setIsEditing(false)
        setPassword('')
        setConfirmPassword('')
      },
    })
  }

  const handleCancel = () => {
    setPassword('')
    setConfirmPassword('')
    setIsEditing(false)
  }

  return (
    <section className="bg-surface rounded-[14px] border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <HugeiconsIcon icon={LockIcon} size={18} className="text-text-secondary" />
        <h2 className="text-sm font-semibold text-text-primary">Passwort</h2>
      </div>

      <div className="flex flex-col gap-3">
        {isEditing ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-password" className="text-xs font-medium text-text-secondary">
                Neues Passwort
              </label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="bg-bg"
                autoFocus
              />
            </div>

            <PasswordChecklist password={password} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm-password" className="text-xs font-medium text-text-secondary">
                Passwort bestätigen
              </label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Passwort wiederholen"
                className="bg-bg"
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <span className="text-xs text-awaiting">Passwörter stimmen nicht überein</span>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={!canSubmit} variant="accent" size="sm">
                {updatePassword.isPending ? 'Speichern...' : 'Passwort ändern'}
              </Button>
              <Button onClick={handleCancel} variant="outline" size="sm">
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setIsEditing(true)}
            variant="link"
            size="sm"
            className="text-xs p-0 h-auto self-start"
          >
            Passwort ändern
          </Button>
        )}
      </div>
    </section>
  )
}
