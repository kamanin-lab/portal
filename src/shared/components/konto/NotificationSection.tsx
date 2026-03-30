import { HugeiconsIcon } from '@hugeicons/react'
import { Notification03Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/shared/lib/utils'
import type { NotificationPreferences } from '@/shared/types/common'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/shared/types/common'
import { useUpdateProfile } from '@/shared/hooks/useUpdateProfile'
import { useWorkspaces } from '@/shared/hooks/useWorkspaces'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components/ui/tabs'

interface Props {
  preferences: NotificationPreferences | null
}

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex-1 min-w-0 mr-4">
        <span className="text-sm text-text-primary">{label}</span>
        <p className="text-xs text-text-tertiary mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          checked ? 'bg-accent' : 'bg-border'
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

type OptionDef = { key: keyof NotificationPreferences; label: string; description: string }

const TASK_OPTIONS: OptionDef[] = [
  { key: 'task_review',        label: 'Aufgabe zur Prüfung bereit',   description: 'Benachrichtigung, wenn eine Aufgabe auf Ihre Rückmeldung wartet.' },
  { key: 'task_completed',     label: 'Aufgabe abgeschlossen',         description: 'Benachrichtigung, wenn eine Aufgabe als erledigt markiert wurde.' },
  { key: 'team_comment',       label: 'Neue Nachricht vom Team',       description: 'Benachrichtigung bei neuen Nachrichten oder Rückfragen zu Ihren Aufgaben.' },
  { key: 'support_response',   label: 'Support-Antwort',               description: 'Benachrichtigung bei neuen Antworten im Support-Chat.' },
  { key: 'reminders',          label: 'Erinnerungen',                  description: 'Erinnerung alle 5 Tage bei ausstehender Prüfung oder Kostenfreigabe.' },
  { key: 'new_recommendation', label: 'Neue Empfehlung',               description: 'Benachrichtigung, wenn das Team eine neue Empfehlung für Sie erstellt hat.' },
]

const PROJECT_OPTIONS: OptionDef[] = [
  { key: 'project_task_ready',     label: 'Aufgabe zur Prüfung bereit',    description: 'Benachrichtigung, wenn eine Projektaufgabe Ihre Freigabe benötigt.' },
  { key: 'project_step_completed', label: 'Projektschritt abgeschlossen',  description: 'Benachrichtigung, wenn alle Aufgaben eines Schritts abgeschlossen wurden.' },
  { key: 'project_messages',       label: 'Neue Nachricht vom Team',        description: 'Benachrichtigung bei neuen Nachrichten zu Ihren Projektaufgaben.' },
]

export function NotificationSection({ preferences }: Props) {
  const currentPrefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...preferences }
  const updateProfile = useUpdateProfile()
  const { data: workspaces = [] } = useWorkspaces()
  const hasProjects = workspaces.some(w => w.module_key === 'projects')

  const handleToggle = (key: keyof NotificationPreferences, checked: boolean) => {
    updateProfile.mutate({ notification_preferences: { ...currentPrefs, [key]: checked } })
  }

  const renderOptions = (options: OptionDef[]) => (
    <div className="divide-y divide-border-light">
      {options.map(opt => (
        <ToggleRow
          key={opt.key}
          label={opt.label}
          description={opt.description}
          checked={currentPrefs[opt.key]}
          onChange={v => handleToggle(opt.key, v)}
        />
      ))}
    </div>
  )

  return (
    <section className="bg-surface rounded-[14px] border border-border p-5">
      <div className="flex items-center gap-2 mb-2">
        <HugeiconsIcon icon={Notification03Icon} size={18} className="text-text-secondary" />
        <h2 className="text-sm font-semibold text-text-primary">E-Mail-Benachrichtigungen</h2>
      </div>
      <p className="text-xs text-text-tertiary mb-4">
        Wählen Sie, welche E-Mail-Benachrichtigungen Sie erhalten möchten.
        In-App-Benachrichtigungen bleiben immer aktiv.
      </p>

      {hasProjects ? (
        <Tabs defaultValue="aufgaben">
          <TabsList className="mb-3">
            <TabsTrigger value="aufgaben">Aufgaben</TabsTrigger>
            <TabsTrigger value="projekte">Projekte</TabsTrigger>
          </TabsList>
          <TabsContent value="aufgaben">{renderOptions(TASK_OPTIONS)}</TabsContent>
          <TabsContent value="projekte">{renderOptions(PROJECT_OPTIONS)}</TabsContent>
        </Tabs>
      ) : (
        renderOptions(TASK_OPTIONS)
      )}
    </section>
  )
}
