import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import type { FaqItemData } from '@/shared/lib/hilfe-faq-data'
import { FaqItem } from './FaqItem'

interface FaqSectionProps {
  section: {
    id: string
    title: string
    icon: IconSvgElement
    items: FaqItemData[]
  }
}

export function FaqSection({ section }: FaqSectionProps) {
  return (
    <section className="bg-[var(--surface)] rounded-[14px] border border-[var(--border)] p-5">
      <div className="flex items-center gap-2 mb-3">
        <HugeiconsIcon
          icon={section.icon}
          size={18}
          className="text-[var(--text-secondary)]"
        />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {section.title}
        </h2>
      </div>

      <div className="border-b border-[var(--border)] mb-1" />

      <div className="flex flex-col">
        {section.items.map((item, index) => (
          <FaqItem
            key={item.question}
            question={item.question}
            answer={item.answer}
            isLast={index === section.items.length - 1}
          />
        ))}
      </div>
    </section>
  )
}
