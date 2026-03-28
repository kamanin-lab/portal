import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { dict } from '../lib/dictionary'

interface Props {
  onClick: () => void
}

export function NewTaskButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-2 text-body font-semibold bg-cta text-white rounded-[var(--r-md)] hover:bg-cta-hover transition-colors cursor-pointer"
    >
      <HugeiconsIcon icon={PlusSignIcon} size={15} />
      {dict.actions.newTicket}
    </button>
  )
}
