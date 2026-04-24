import * as Dialog from '@radix-ui/react-dialog'
import { HugeiconsIcon } from '@hugeicons/react'
import { MultiplicationSignIcon } from '@hugeicons/core-free-icons'

interface SideSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** @deprecated Use the `footer` prop instead. Will be removed in a future release. */
  managed?: boolean
  /** Sticky footer rendered below the scroll body (e.g. comment composer). Border-t + keyboard padding are applied automatically. */
  footer?: React.ReactNode
}

export function SideSheet({ open, onClose, title, children, managed, footer }: SideSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={o => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 data-[state=open]:animate-[fadeIn_150ms_ease]" />
        <Dialog.Content
          className="fixed top-0 right-0 z-50 h-full w-full max-w-[680px] bg-bg shadow-2xl flex flex-col data-[state=open]:animate-[slideInRight_200ms_ease] data-[state=closed]:animate-[slideOutRight_150ms_ease] focus:outline-none overflow-hidden"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>

          <div className="flex items-center justify-end px-5 py-3 border-b border-border shrink-0">
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-[var(--r-sm)] text-text-tertiary hover:text-text-primary hover:bg-surface-raised transition-colors">
                <HugeiconsIcon icon={MultiplicationSignIcon} size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className={
            footer
              ? "flex-1 overflow-y-auto min-h-0"
              : managed
                ? "flex-1 overflow-hidden flex flex-col min-h-0"
                : "flex-1 overflow-y-auto"
          }>
            {children}
          </div>

          {footer && (
            <div
              className="shrink-0 border-t border-border px-6 max-[768px]:px-4"
              style={{ paddingBottom: 'max(0.75rem, env(keyboard-inset-height, 0px))' }}
            >
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
