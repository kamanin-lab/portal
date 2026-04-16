import { HugeiconsIcon } from '@hugeicons/react'
import { InformationCircleIcon } from '@hugeicons/core-free-icons'

const ROLES = [
  {
    label: 'Administrator',
    description: 'Vollzugriff: Mitglieder einladen, Rollen ändern, Mitglieder entfernen und alle Organisationsdaten verwalten.',
  },
  {
    label: 'Mitglied',
    description: 'Kann Projekte, Tickets und Dateien einsehen sowie Kommentare und Anfragen erstellen.',
  },
  {
    label: 'Betrachter',
    description: 'Nur-Lese-Zugriff: Projekte und Tickets einsehen, keine Änderungen möglich.',
  },
]

export function RolesInfoSection() {
  return (
    <section className="bg-surface rounded-[14px] border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <HugeiconsIcon icon={InformationCircleIcon} size={18} className="text-text-secondary" />
        <h2 className="text-sm font-semibold text-text-primary">Rollenübersicht</h2>
      </div>

      <div className="flex flex-col gap-3">
        {ROLES.map(role => (
          <div key={role.label} className="flex gap-3">
            <span className="text-sm font-medium text-text-primary w-28 shrink-0">{role.label}</span>
            <span className="text-sm text-text-secondary">{role.description}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
