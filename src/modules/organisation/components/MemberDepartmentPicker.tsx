import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkSquare02Icon, SquareIcon, GridViewIcon } from '@hugeicons/core-free-icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { useOrg } from '@/shared/hooks/useOrg'
import { useUpdateMemberDepartments } from '../hooks/useUpdateMemberDepartments'
import type { DepartmentCacheEntry } from '@/shared/types/organization'

interface Props {
  memberId: string
  memberDepartments: string[]
}

/**
 * Multi-select picker for assigning departments to an org member.
 * Rendered inside the TeamSection member row. Admin-only.
 */
export function MemberDepartmentPicker({ memberId, memberDepartments }: Props) {
  const { organization } = useOrg()
  const { updateDepartments } = useUpdateMemberDepartments()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(memberDepartments)
  const [saving, setSaving] = useState(false)

  const departmentsCache: DepartmentCacheEntry[] = organization?.departments_cache ?? []
  const hasField = !!organization?.clickup_department_field_id

  if (!hasField || departmentsCache.length === 0) return null

  function toggle(optionId: string) {
    setSelected((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId],
    )
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateDepartments(memberId, selected)
      setOpen(false)
    } catch {
      // Toast handled by hook
    } finally {
      setSaving(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setSelected(memberDepartments)
    setOpen(nextOpen)
  }

  function resolveName(id: string): string {
    return departmentsCache.find((o) => o.id === id)?.name ?? id
  }

  const hasChanges =
    selected.length !== memberDepartments.length ||
    selected.some((id) => !memberDepartments.includes(id))

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="flex flex-wrap items-center gap-1 cursor-pointer group min-w-0"
          aria-label="Fachbereiche zuweisen"
        >
          {memberDepartments.length === 0 ? (
            <span className="text-xs text-text-tertiary group-hover:text-accent transition-colors flex items-center gap-1">
              <HugeiconsIcon icon={GridViewIcon} size={12} />
              Alle
            </span>
          ) : (
            memberDepartments.map((id) => (
              <Badge key={id} variant="outline" className="text-[11px] font-normal">
                {resolveName(id)}
              </Badge>
            ))
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <p className="text-xs font-semibold text-text-primary mb-2 px-1">
          Fachbereiche
        </p>
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
                  size={15}
                  className={isSelected ? 'text-accent' : 'text-text-tertiary'}
                />
                <span className="text-sm text-text-primary">{opt.name}</span>
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-text-tertiary mt-2 px-1">
          Leer = sieht alle Aufgaben
        </p>
        {hasChanges && (
          <div className="mt-2 pt-2 border-t border-border">
            <Button
              size="sm"
              className="w-full"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Speichern...' : 'Speichern'}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
