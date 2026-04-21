import { useEffect, useId, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/shared/lib/utils'

interface CollapsibleRowProps {
  defaultOpen?: boolean
  forceOpen?: boolean
  header: React.ReactNode
  children: React.ReactNode
  className?: string
  chevronPosition?: 'left' | 'right'
  chevronClassName?: string
}

export function CollapsibleRow({
  defaultOpen = false,
  forceOpen = false,
  header,
  children,
  className,
  chevronPosition = 'left',
  chevronClassName,
}: CollapsibleRowProps) {
  // Pre-filter state: toggled freely by the user when forceOpen is false.
  const [userOpen, setUserOpen] = useState(defaultOpen)
  // During forceOpen: user can still collapse the auto-expanded section.
  // Null means "follow forceOpen"; boolean means "user has overridden".
  // Reset to null whenever forceOpen turns off so the override doesn't leak.
  const [filterOverride, setFilterOverride] = useState<boolean | null>(null)

  useEffect(() => {
    if (!forceOpen) setFilterOverride(null)
  }, [forceOpen])

  const isOpen = forceOpen ? (filterOverride ?? true) : userOpen
  const regionId = useId()

  function handleToggle() {
    if (forceOpen) {
      setFilterOverride(prev => !(prev ?? true))
    } else {
      setUserOpen(prev => !prev)
    }
  }

  const chevron = (
    <HugeiconsIcon
      icon={ArrowDown01Icon}
      size={14}
      className={cn(
        'shrink-0 text-text-tertiary transition-transform duration-200',
        isOpen && 'rotate-180',
        chevronClassName
      )}
    />
  )

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={regionId}
        onClick={handleToggle}
        className="w-full flex items-center gap-1.5 text-left cursor-pointer"
      >
        {chevronPosition === 'left' && chevron}
        <span className="flex-1 min-w-0">{header}</span>
        {chevronPosition === 'right' && chevron}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={regionId}
            role="region"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
