import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/shared/components/layout/AppShell'
import { ProtectedRoute } from './ProtectedRoute'
import { WorkspaceGuard } from '@/shared/components/WorkspaceGuard'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton'

const LoginPage = lazy(() => import('@/shared/pages/LoginPage').then(m => ({ default: m.LoginPage })))
const InboxPage = lazy(() => import('@/shared/pages/InboxPage').then(m => ({ default: m.InboxPage })))
const MeineAufgabenPage = lazy(() => import('@/shared/pages/MeineAufgabenPage').then(m => ({ default: m.MeineAufgabenPage })))
const HilfePage = lazy(() => import('@/shared/pages/HilfePage').then(m => ({ default: m.HilfePage })))
const NotFoundPage = lazy(() => import('@/shared/pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })))
const UebersichtPage = lazy(() => import('@/modules/projects/pages/UebersichtPage').then(m => ({ default: m.UebersichtPage })))
const NachrichtenPage = lazy(() => import('@/modules/projects/pages/NachrichtenPage').then(m => ({ default: m.NachrichtenPage })))
const DateienPage = lazy(() => import('@/modules/projects/pages/DateienPage').then(m => ({ default: m.DateienPage })))
const TicketsPage = lazy(() => import('@/modules/tickets/pages/TicketsPage').then(m => ({ default: m.TicketsPage })))
const SupportPage = lazy(() => import('@/modules/tickets/pages/SupportPage').then(m => ({ default: m.SupportPage })))

function RouteLoading() {
  return (
    <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
      <LoadingSkeleton lines={6} height="56px" />
    </ContentContainer>
  )
}

function withRouteLoading(node: ReactNode) {
  return <Suspense fallback={<RouteLoading />}>{node}</Suspense>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/inbox" replace />} />
      <Route path="/login" element={withRouteLoading(<LoginPage />)} />

      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/inbox" element={withRouteLoading(<InboxPage />)} />
        <Route path="/meine-aufgaben" element={withRouteLoading(<MeineAufgabenPage />)} />

        <Route
          path="/tickets"
          element={withRouteLoading(<WorkspaceGuard moduleKey="tickets"><TicketsPage /></WorkspaceGuard>)}
        />
        <Route
          path="/support"
          element={withRouteLoading(<WorkspaceGuard moduleKey="tickets"><SupportPage /></WorkspaceGuard>)}
        />

        <Route
          path="/projekte/*"
          element={withRouteLoading(<WorkspaceGuard moduleKey="projects"><UebersichtPage /></WorkspaceGuard>)}
        />
        <Route path="/aufgaben" element={<Navigate to="/tickets" replace />} />
        <Route path="/nachrichten" element={withRouteLoading(<NachrichtenPage />)} />
        <Route path="/dateien" element={withRouteLoading(<DateienPage />)} />
        <Route path="/hilfe" element={withRouteLoading(<HilfePage />)} />
      </Route>

      <Route path="*" element={withRouteLoading(<NotFoundPage />)} />
    </Routes>
  )
}
