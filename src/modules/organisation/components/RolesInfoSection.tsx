import { HugeiconsIcon } from '@hugeicons/react'
import { InformationCircleIcon } from '@hugeicons/core-free-icons'

const ROLES = [
  {
    label: 'Administrator',
    description: 'Vollzugriff: Mitglieder einladen, Rollen ändern und entfernen. Zusätzlich alle Rechte des Mitglieds.',
  },
  {
    label: 'Mitglied',
    description: 'Tickets und Projektschritte freigeben oder Änderungen anfordern, Angebote (Credits) annehmen oder ablehnen, neue Tickets erstellen und Kommentare verfassen.',
  },
  {
    label: 'Betrachter',
    description: 'Nur-Lese-Zugriff: Projekte, Tickets und Dateien einsehen. Keine Freigaben, keine Kommentare, keine Aktionen.',
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
