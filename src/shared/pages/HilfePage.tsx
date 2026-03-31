// src/shared/pages/HilfePage.tsx
import { motion } from 'motion/react'
import { type IconSvgElement } from '@hugeicons/react'
import {
  HelpCircleIcon,
  FolderOpenIcon,
  CustomerService01Icon,
  FolderCloudIcon,
  CreditCardIcon,
  Notification01Icon,
  UserCircleIcon,
} from '@hugeicons/core-free-icons'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'
import { FaqSection } from '@/shared/components/help/FaqSection'
import { FAQ_SECTIONS } from '@/shared/lib/hilfe-faq-data'

// Map iconName strings from FAQ_SECTIONS data to actual Hugeicons icon objects.
const ICON_MAP: Record<string, IconSvgElement> = {
  FolderOpenIcon: FolderOpenIcon,
  CustomerService01Icon: CustomerService01Icon,
  FolderCloudIcon: FolderCloudIcon,
  CreditCardIcon: CreditCardIcon,
  Notification01Icon: Notification01Icon,
  UserCircleIcon: UserCircleIcon,
}

export function HilfePage() {
  const resolvedSections = FAQ_SECTIONS.map((section) => ({
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

        {resolvedSections.map((section, index) => (
          <motion.div
            key={section.id}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <FaqSection section={section} />
          </motion.div>
        ))}
      </div>
    </ContentContainer>
  )
}
