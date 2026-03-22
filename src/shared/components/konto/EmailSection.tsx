import { useState } from 'react'
import { Mail } from 'lucide-react'
import { toast } from 'sonner'
import { useUpdateEmail } from '@/shared/hooks/useUpdateProfile'

interface Props {
  currentEmail: string
}

export function EmailSection({ currentEmail }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [confirmSent, setConfirmSent] = useState(false)
  const updateEmail = useUpdateEmail()

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const handleSave = () => {
    const trimmed = newEmail.trim()
    if (!trimmed || trimmed === currentEmail) return
    if (!isValidEmail(trimmed)) {
      toast.error('Ungültige E-Mail-Adresse.')
      return
    }
    updateEmail.mutate(trimmed, {
      onSuccess: () => {
        setConfirmSent(true)
        setIsEditing(false)
        setNewEmail('')
      },
    })
  }

  const handleCancel = () => {
    setNewEmail('')
    setIsEditing(false)
  }

  return (
    <section className="bg-surface rounded-[14px] border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <Mail size={18} className="text-text-secondary" />
        <h2 className="text-sm font-semibold text-text-primary">E-Mail-Adresse</h2>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Aktuelle E-Mail</span>
          <span className="text-sm text-text-primary">{currentEmail}</span>
        </div>

        {confirmSent && (
          <p className="text-xs text-committed bg-committed-bg px-3 py-2 rounded-[8px]">
            Wir haben eine Bestätigungsemail an Ihre aktuelle und neue Adresse gesendet.
          </p>
        )}

        {isEditing ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="new-email" className="text-xs font-medium text-text-secondary">
              Neue E-Mail-Adresse
            </label>
            <div className="flex gap-2">
              <input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="neue@adresse.de"
                className="flex-1 h-9 px-3 rounded-[8px] border border-border bg-bg text-text-primary text-sm outline-none focus:border-accent transition-colors"
                autoFocus
              />
              <button
                onClick={handleSave}
                disabled={!newEmail.trim() || newEmail.trim() === currentEmail || updateEmail.isPending}
                className="h-9 px-4 rounded-[8px] bg-accent text-white text-xs font-semibold hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {updateEmail.isPending ? 'Senden...' : 'Ändern'}
              </button>
              <button
                onClick={handleCancel}
                className="h-9 px-3 rounded-[8px] border border-border text-text-secondary text-xs font-medium hover:bg-surface-hover transition-colors"
              >
                Abbrechen
              </button>
            </div>
            <p className="text-xs text-text-tertiary">
              Sie erhalten eine Bestätigungsemail an beide Adressen.
            </p>
          </div>
        ) : (
          <button
            onClick={() => { setIsEditing(true); setConfirmSent(false) }}
            className="text-xs text-accent hover:text-accent-hover transition-colors self-start"
          >
            E-Mail ändern
          </button>
        )}
      </div>
    </section>
  )
}
