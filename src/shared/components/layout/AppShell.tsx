import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileHeader } from './MobileHeader'
import { MobileSidebarOverlay } from './MobileSidebarOverlay'
import { BottomNav } from './BottomNav'
import { useSwipeGesture } from '@/shared/hooks/useSwipeGesture'

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
  const location = useLocation()
  const title = getTitle(location.pathname)

  useSwipeGesture({
    onSwipeRight: () => setSidebarOpen(true),
    onSwipeLeft: () => setSidebarOpen(false),
    isOpen: sidebarOpen,
  })

  return (
    <div className="min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
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
        className="
          md:ml-[56px]
          pt-[52px] md:pt-0
          pb-[64px] md:pb-0
          min-h-screen
        "
      >
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  )
}
