import { HugeiconsIcon } from '@hugeicons/react'
import { Building05Icon } from '@hugeicons/core-free-icons'
import { useOrg } from '@/shared/hooks/useOrg'
import { useCredits } from '@/modules/tickets/hooks/useCredits'

export function OrgInfoSection() {
  const { organization } = useOrg()
  const credits = useCredits()

  if (!organization) return null

  return (
    <section className="bg-surface rounded-[14px] border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <HugeiconsIcon icon={Building05Icon} size={18} className="text-text-secondary" />
        <h2 className="text-sm font-semibold text-text-primary">Organisation</h2>
      </div>

      <div className="flex flex-col gap-3">
        <Field label="Name" value={organization.name} />
        <Field label="Kürzel" value={organization.slug} />
        <Field
          label="Guthaben"
          value={credits.isLoading ? 'Lädt...' : `${credits.balance} Impulse`}
        />
      </div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <span className="text-sm text-text-primary">{value || 'Nicht angegeben'}</span>
    </div>
  )
}
