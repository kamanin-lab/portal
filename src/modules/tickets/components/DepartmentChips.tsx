import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { GridViewIcon, CheckmarkSquare02Icon, SquareIcon } from '@hugeicons/core-free-icons'
import { Badge } from '@/shared/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { Button } from '@/shared/components/ui/button'
import { useOrg } from '@/shared/hooks/useOrg'
import { useUpdateTaskDepartments } from '../hooks/useUpdateTaskDepartments'
import { resolveDepartmentName, type DepartmentOption } from '../lib/visibility-filter'

interface Props {
  clickupId: string
  departments: string[]
}

/**
 * Displays department (Fachbereich) chips on a ticket.
 * Admin: editable multi-select popover.
 * Member/viewer: read-only chips.
 * Empty departments: "Fur alle sichtbar" label.
 */
export function DepartmentChips({ clickupId, departments }: Props) {
  const { isAdmin, organization } = useOrg()
  const departmentsCache: DepartmentOption[] = organization?.departments_cache ?? []
  const hasDepartmentField = !!organization?.clickup_department_field_id

  // If no department field configured on this org, don't render anything
  if (!hasDepartmentField || departmentsCache.length === 0) return null

  if (isAdmin) {
    return (
      <AdminDepartmentEditor
        clickupId={clickupId}
        departments={departments}
        departmentsCache={departmentsCache}
      />
    )
  }

  return (
    <ReadOnlyChips
      departments={departments}
      departmentsCache={departmentsCache}
    />
  )
}

function ReadOnlyChips({
  departments,
  departmentsCache,
}: {
  departments: string[]
  departmentsCache: DepartmentOption[]
}) {
  if (departments.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
        <HugeiconsIcon icon={GridViewIcon} size={13} />
        <span>Für alle sichtbar</span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <HugeiconsIcon icon={GridViewIcon} size={13} className="text-text-tertiary shrink-0" />
      {departments.map((id) => (
        <Badge key={id} variant="outline" className="text-xs font-normal">
          {resolveDepartmentName(id, departmentsCache)}
        </Badge>
      ))}
    </div>
  )
}

function AdminDepartmentEditor({
  clickupId,
  departments,
  departmentsCache,
}: {
  clickupId: string
  departments: string[]
  departmentsCache: DepartmentOption[]
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(departments)
  const mutation = useUpdateTaskDepartments()

  function toggle(optionId: string) {
    setSelected((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId],
    )
  }

  function handleSave() {
    mutation.mutate({ clickupId, departmentIds: selected })
    setOpen(false)
  }

  // Reset selection when popover opens
  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setSelected(departments)
    setOpen(nextOpen)
  }

  const hasChanges =
    selected.length !== departments.length ||
    selected.some((id) => !departments.includes(id))

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="flex flex-wrap items-center gap-1.5 cursor-pointer group"
          aria-label="Fachbereiche bearbeiten"
        >
          <HugeiconsIcon
            icon={GridViewIcon}
            size={13}
            className="text-text-tertiary group-hover:text-accent transition-colors shrink-0"
          />
          {departments.length === 0 ? (
            <span className="text-xs text-text-tertiary group-hover:text-accent transition-colors">
              Fachbereich zuweisen
            </span>
          ) : (
            departments.map((id) => (
              <Badge key={id} variant="outline" className="text-xs font-normal">
                {resolveDepartmentName(id, departmentsCache)}
              </Badge>
            ))
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="text-xs font-semibold text-text-primary mb-2 px-1">Fachbereiche</p>
        <div className="flex flex-col gap-0.5">
          {departmentsCache.map((opt) => {
            const isSelected = selected.includes(opt.id)
            return (
              <button
                key={opt.id}
                onClick={() => toggle(opt.id)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--r-sm)] hover:bg-surface-hover transition-colors text-left w-full"
              >
                <HugeiconsIcon
                  icon={isSelected ? CheckmarkSquare02Icon : SquareIcon}
                  size={16}
                  className={isSelected ? 'text-accent' : 'text-text-tertiary'}
                />
                <span className="text-sm text-text-primary">{opt.name}</span>
              </button>
            )
          })}
        </div>
        {hasChanges && (
          <div className="mt-2 pt-2 border-t border-border">
            <Button
              size="sm"
              className="w-full"
              onClick={handleSave}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Speichern...' : 'Speichern'}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
