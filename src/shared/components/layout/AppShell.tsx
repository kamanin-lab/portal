import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileHeader } from './MobileHeader'
import { MobileSidebarOverlay } from './MobileSidebarOverlay'
import { BottomNav } from './BottomNav'
import { useSwipeGesture } from '@/shared/hooks/useSwipeGesture'
import { cn } from '@/shared/lib/utils'

const PAGE_TITLES: Record<string, string> = {
  '/inbox': 'Inbox',
  '/meine-aufgaben': 'Meine Aufgaben',
  '/tickets': 'Aufgaben',
  '/support': 'Support',
  '/projekte': 'Projekte',
  '/nachrichten': 'Nachrichten',
  '/dateien': 'Dateien',
  '/hilfe': 'Hilfe',
  '/konto': 'Konto',
}

function getTitle(pathname: string): string {
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(prefix)) return title
  }
  return 'Portal'
}

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    try {
      const stored = localStorage.getItem('portal-sidebar-expanded')
      return stored === null ? true : stored === 'true'
    } catch {
      return true
    }
  })
  const location = useLocation()
  const title = getTitle(location.pathname)

  const toggleSidebar = () => setSidebarExpanded(v => {
    const next = !v
    try { localStorage.setItem('portal-sidebar-expanded', String(next)) } catch {}
    return next
  })

  useSwipeGesture({
    onSwipeRight: () => setSidebarOpen(true),
    onSwipeLeft: () => setSidebarOpen(false),
    isOpen: sidebarOpen,
  })

  return (
    <div className="min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar expanded={sidebarExpanded} onToggle={toggleSidebar} />
      </div>

      {/* Mobile header */}
      <MobileHeader
        title={title}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(v => !v)}
      />

      {/* Mobile sidebar overlay */}
      <MobileSidebarOverlay
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content */}
      <main
        className={cn(
          'pt-13 md:pt-0 pb-16 md:pb-0 min-h-screen transition-[margin-left] duration-200',
          sidebarExpanded ? 'md:ml-[260px]' : 'md:ml-14'
        )}
      >
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  )
}
