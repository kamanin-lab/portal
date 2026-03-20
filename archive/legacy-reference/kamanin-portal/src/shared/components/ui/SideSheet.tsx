import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

interface SideSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function SideSheet({ open, onClose, title, children }: SideSheetProps) {
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
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
