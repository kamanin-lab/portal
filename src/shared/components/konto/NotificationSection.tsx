import { HugeiconsIcon } from '@hugeicons/react'
import { Notification03Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/shared/lib/utils'
import type { NotificationPreferences } from '@/shared/types/common'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/shared/types/common'
import { useUpdateProfile } from '@/shared/hooks/useUpdateProfile'

interface Props {
  preferences: NotificationPreferences | null
}

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  disabledLabel?: string
  onChange: (checked: boolean) => void
}

function ToggleRow({ label, description, checked, disabled, disabledLabel, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex-1 min-w-0 mr-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-primary">{label}</span>
          {disabled && disabledLabel && (
            <span className="text-2xs font-medium text-text-tertiary bg-surface-active px-1.5 py-0.5 rounded">
              {disabledLabel}
            </span>
          )}
        </div>
        <p className="text-xs text-text-tertiary mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          checked ? 'bg-accent' : 'bg-border',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow-sm',
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
          )}
        />
      </button>
    </div>
  )
}

const NOTIFICATION_OPTIONS: Array<{
  key: keyof NotificationPreferences
  label: string
  description: string
  disabled?: boolean
  disabledLabel?: string
}> = [
  {
    key: 'task_review',
    label: 'Aufgabe zur Prüfung bereit',
    description: 'Benachrichtigung, wenn eine Aufgabe auf Ihre Rückmeldung wartet.',
  },
  {
    key: 'task_completed',
    label: 'Aufgabe abgeschlossen',
    description: 'Benachrichtigung, wenn eine Aufgabe als erledigt markiert wurde.',
  },
  {
    key: 'team_comment',
    label: 'Neue Nachricht vom Team',
    description: 'Benachrichtigung bei neuen Nachrichten oder Rückfragen zu Ihren Aufgaben.',
  },
  {
    key: 'support_response',
    label: 'Support-Antwort',
    description: 'Benachrichtigung bei neuen Antworten im Support-Chat.',
  },
  {
    key: 'reminders',
    label: 'Erinnerungen',
    description: 'Erinnerung alle 5 Tage bei ausstehender Prüfung oder Kostenfreigabe.',
  },
  {
    key: 'new_recommendation',
    label: 'Neue Empfehlung',
    description: 'Benachrichtigung, wenn das Team eine neue Empfehlung für Sie erstellt hat.',
  },
]

export function NotificationSection({ preferences }: Props) {
  const currentPrefs = preferences ?? DEFAULT_NOTIFICATION_PREFERENCES
  const updateProfile = useUpdateProfile()

  const handleToggle = (key: keyof NotificationPreferences, checked: boolean) => {
    const updatedPrefs = { ...currentPrefs, [key]: checked }
    updateProfile.mutate({ notification_preferences: updatedPrefs })
  }

  return (
    <section className="bg-surface rounded-[14px] border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <HugeiconsIcon icon={Notification03Icon} size={18} className="text-text-secondary" />
        <h2 className="text-sm font-semibold text-text-primary">E-Mail-Benachrichtigungen</h2>
      </div>

      <p className="text-xs text-text-tertiary mb-3">
        Wählen Sie, welche E-Mail-Benachrichtigungen Sie erhalten möchten.
        In-App-Benachrichtigungen bleiben immer aktiv.
      </p>

      <div className="divide-y divide-border-light">
        {NOTIFICATION_OPTIONS.map(opt => (
          <ToggleRow
            key={opt.key}
            label={opt.label}
            description={opt.description}
            checked={currentPrefs[opt.key]}
            disabled={opt.disabled}
            disabledLabel={opt.disabledLabel}
            onChange={checked => handleToggle(opt.key, checked)}
          />
        ))}
      </div>
    </section>
  )
}
