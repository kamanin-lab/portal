import { Navigate } from 'react-router-dom'

export function MeineAufgabenPage() {
  return <Navigate to="/tickets?filter=needs_attention" replace />
}
