// src/shared/pages/HilfePage.tsx
import { useState, useMemo } from 'react'
import { motion } from 'motion/react'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import {
  HelpCircleIcon,
  FolderOpenIcon,
  CustomerService01Icon,
  FolderCloudIcon,
  CreditCardIcon,
  Notification01Icon,
  UserCircleIcon,
  UserGroupIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'
import { FaqSection } from '@/shared/components/help/FaqSection'
import { EmptyState } from '@/shared/components/common/EmptyState'
import { Input } from '@/shared/components/ui/input'
import { FAQ_SECTIONS } from '@/shared/lib/hilfe-faq-data'

const ICON_MAP: Record<string, IconSvgElement> = {
  FolderOpenIcon,
  CustomerService01Icon,
  FolderCloudIcon,
  CreditCardIcon,
  Notification01Icon,
  UserCircleIcon,
  UserGroupIcon,
}

export function HilfePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return FAQ_SECTIONS
    return FAQ_SECTIONS
      .map((s) => ({
        ...s,
        items: s.items.filter(
          (i) =>
            i.question.toLowerCase().includes(normalizedQuery) ||
            i.answer.toLowerCase().includes(normalizedQuery),
        ),
      }))
      .filter((s) => s.items.length > 0)
  }, [normalizedQuery])

  const resolvedSections = filteredSections.map((section) => ({
    ...section,
    icon: ICON_MAP[section.iconName] ?? HelpCircleIcon,
  }))

  return (
    <ContentContainer width="narrow">
      <div className="p-6 max-[768px]:p-4 flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            Hilfe & FAQ
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Antworten auf häufige Fragen zum Portal
          </p>
        </div>

        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none"
          />
          <Input
            aria-label="FAQ durchsuchen"
            placeholder="FAQ durchsuchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {resolvedSections.length === 0 ? (
          <EmptyState message="Keine Ergebnisse. Versuchen Sie andere Begriffe." />
        ) : (
          resolvedSections.map((section, index) => (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <FaqSection section={section} />
            </motion.div>
          ))
        )}
      </div>
    </ContentContainer>
  )
}
