import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'

interface Props {
  onClick: () => void
}

export function NewTaskButton({ onClick }: Props) {
  const { isMobile } = useBreakpoint()

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-2 text-body font-semibold bg-cta text-white rounded-[var(--r-md)] hover:bg-cta-hover transition-colors cursor-pointer shrink-0"
    >
      <HugeiconsIcon icon={PlusSignIcon} size={15} />
      {isMobile ? 'Aufgabe' : 'Neue Aufgabe'}
    </button>
  )
}
