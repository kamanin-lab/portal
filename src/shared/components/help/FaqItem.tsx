import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/shared/lib/utils'

interface FaqItemProps {
  question: string
  answer: string
  isLast?: boolean
}

export function FaqItem({ question, answer, isLast = false }: FaqItemProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className={cn(!isLast && 'border-b border-[var(--border-light)]')}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between py-3 text-left hover:bg-[var(--surface-hover)] rounded-[var(--r-sm)] px-2 -mx-2 transition-colors"
      >
        <span className="text-sm font-medium text-[var(--text-primary)] leading-snug pr-4">
          {question}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={16}
          className={cn(
            'text-[var(--text-tertiary)] shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed pt-1 pb-3 px-0">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
