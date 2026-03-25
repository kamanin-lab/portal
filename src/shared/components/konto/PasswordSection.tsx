import { useState } from 'react'
import { Check, Lock, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/shared/lib/utils'
import { PASSWORD_RULES, validatePassword } from '@/shared/lib/password-validation'
import { useUpdatePassword } from '@/shared/hooks/useUpdateProfile'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'

export function PasswordSection() {
  const [isEditing, setIsEditing] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const updatePassword = useUpdatePassword()

  const { valid, results } = validatePassword(password)
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
        <Lock size={18} className="text-text-secondary" />
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

            {/* Password strength rules */}
            {password.length > 0 && (
              <div className="flex flex-col gap-1">
                {PASSWORD_RULES.map(rule => {
                  const result = results.find(r => r.key === rule.key)
                  const passed = result?.passed ?? false
                  return (
                    <div key={rule.key} className="flex items-center gap-1.5">
                      {passed ? (
                        <Check size={12} className="text-committed shrink-0" />
                      ) : (
                        <X size={12} className="text-awaiting shrink-0" />
                      )}
                      <span className={cn('text-xs', passed ? 'text-committed' : 'text-awaiting')}>
                        {rule.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

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
