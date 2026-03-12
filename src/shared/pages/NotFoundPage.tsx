import { useNavigate } from 'react-router-dom'

export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-4">
      <p className="text-4xl font-bold text-text-tertiary">404</p>
      <p className="text-text-secondary">Seite nicht gefunden.</p>
      <button
        onClick={() => navigate('/inbox')}
        className="px-4 py-2 bg-accent text-white rounded-[8px] text-sm font-medium hover:bg-accent-hover transition-colors"
      >
        Zurück zur Übersicht
      </button>
    </div>
  )
}
