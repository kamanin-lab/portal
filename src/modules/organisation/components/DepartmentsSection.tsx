import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { GridViewIcon, RotateClockwiseIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { useOrg } from '@/shared/hooks/useOrg'
import { supabase } from '@/shared/lib/supabase'
import { toast } from 'sonner'
import type { DepartmentCacheEntry } from '@/shared/types/organization'

/**
 * Read-only list of department options from organizations.departments_cache.
 * Includes a sync button that triggers fetch-clickup-tasks to refresh the cache.
 * Only rendered when a department field is configured.
 */
export function DepartmentsSection() {
  const { organization } = useOrg()
  const [syncing, setSyncing] = useState(false)

  const departments: DepartmentCacheEntry[] = organization?.departments_cache ?? []
  const hasField = !!organization?.clickup_department_field_id

  if (!hasField) {
    return (
      <section className="bg-surface rounded-[14px] border border-border p-5">
        <div className="flex items-center gap-2 mb-3">
          <HugeiconsIcon icon={GridViewIcon} size={18} className="text-text-secondary" />
          <h2 className="text-sm font-semibold text-text-primary">Fachbereiche</h2>
        </div>
        <p className="text-sm text-text-tertiary">
          Kein Fachbereich-Feld in ClickUp konfiguriert. Erstellen Sie ein Labels-Feld
          namens &quot;Fachbereich&quot; in der ClickUp-Liste und synchronisieren Sie erneut.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          disabled={syncing}
          onClick={handleSync}
        >
          <HugeiconsIcon icon={RotateClockwiseIcon} size={14} className="mr-1" />
          {syncing ? 'Synchronisiere...' : 'Jetzt synchronisieren'}
        </Button>
      </section>
    )
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const { error } = await supabase.functions.invoke('fetch-clickup-tasks', {
        body: {},
      })
      if (error) throw error
      toast.success('Fachbereiche synchronisiert. Bitte Seite neu laden.')
    } catch {
      toast.error('Synchronisation fehlgeschlagen.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <section className="bg-surface rounded-[14px] border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={GridViewIcon} size={18} className="text-text-secondary" />
          <h2 className="text-sm font-semibold text-text-primary">Fachbereiche</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={syncing}
          onClick={handleSync}
        >
          <HugeiconsIcon icon={RotateClockwiseIcon} size={14} className="mr-1" />
          {syncing ? 'Synchronisiere...' : 'Neu synchronisieren'}
        </Button>
      </div>

      {departments.length === 0 ? (
        <p className="text-sm text-text-tertiary">
          Keine Optionen gefunden. Fügen Sie Optionen zum Fachbereich-Feld in ClickUp hinzu.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {departments.map((d) => (
            <Badge key={d.id} variant="outline" className="text-sm font-normal px-3 py-1">
              {d.name}
            </Badge>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-text-tertiary">
        Fachbereiche werden in ClickUp verwaltet. Hier nur zur Ansicht.
      </p>
    </section>
  )
}
