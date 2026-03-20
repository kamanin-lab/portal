import { Menu, X } from 'lucide-react'

interface MobileHeaderProps {
  title: string
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function MobileHeader({ title, sidebarOpen, onToggleSidebar }: MobileHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-[52px] bg-surface border-b border-border flex items-center px-4 md:hidden">
      <button
        onClick={onToggleSidebar}
        className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface-hover transition-colors"
        aria-label="Menü öffnen"
      >
        {sidebarOpen ? <X size={20} className="text-text-primary" /> : <Menu size={20} className="text-text-primary" />}
      </button>
      <span className="ml-3 font-semibold text-text-primary text-sm">{title}</span>
    </header>
  )
}
