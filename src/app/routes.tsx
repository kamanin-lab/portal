import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/shared/components/layout/AppShell'
import { ProtectedRoute } from './ProtectedRoute'
import { WorkspaceGuard } from '@/shared/components/WorkspaceGuard'
import { LoginPage } from '@/shared/pages/LoginPage'
import { InboxPage } from '@/shared/pages/InboxPage'
import { MeineAufgabenPage } from '@/shared/pages/MeineAufgabenPage'
import { HilfePage } from '@/shared/pages/HilfePage'
import { NotFoundPage } from '@/shared/pages/NotFoundPage'
import { UebersichtPage } from '@/modules/projects/pages/UebersichtPage'
import { NachrichtenPage } from '@/modules/projects/pages/NachrichtenPage'
import { DateienPage } from '@/modules/projects/pages/DateienPage'
import { TicketsPage } from '@/modules/tickets/pages/TicketsPage'
import { SupportPage } from '@/modules/tickets/pages/SupportPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/inbox" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/meine-aufgaben" element={<MeineAufgabenPage />} />

        <Route
          path="/tickets"
          element={<WorkspaceGuard moduleKey="tickets"><TicketsPage /></WorkspaceGuard>}
        />
        <Route
          path="/support"
          element={<WorkspaceGuard moduleKey="tickets"><SupportPage /></WorkspaceGuard>}
        />

        <Route
          path="/projekte/*"
          element={<WorkspaceGuard moduleKey="projects"><UebersichtPage /></WorkspaceGuard>}
        />
        <Route path="/aufgaben" element={<Navigate to="/tickets" replace />} />
        <Route path="/nachrichten" element={<NachrichtenPage />} />
        <Route path="/dateien" element={<DateienPage />} />
        <Route path="/hilfe" element={<HilfePage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
