import { useSearchParams } from 'react-router-dom'
import logo from '@/assets/KAMANIN-icon-colour.svg'

export function EinladungAnnehmenPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const type = searchParams.get('type')

  function handleAccept() {
    window.location.href = `/passwort-setzen?token=${encodeURIComponent(token!)}&type=${encodeURIComponent(type ?? 'recovery')}`
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-[400px]">
          <div className="flex flex-col items-center mb-8">
            <img src={logo} alt="KAMANIN" className="h-14 w-auto mb-3" />
            <p className="text-text-tertiary text-sm">Ihr Projektportal</p>
          </div>
          <div className="bg-surface rounded-[14px] border border-border p-6 shadow-md text-center">
            <h2 className="text-base font-semibold text-text-primary mb-3">Ungültiger Einladungslink</h2>
            <p className="text-sm text-text-secondary">
              Dieser Einladungslink ist ungültig oder unvollständig. Bitte wenden Sie sich an Ihren Administrator für eine neue Einladung.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="KAMANIN" className="h-14 w-auto mb-3" />
          <p className="text-text-tertiary text-sm">Ihr Projektportal</p>
        </div>
        <div className="bg-surface rounded-[14px] border border-border p-6 shadow-md text-center">
          <h1 className="text-lg font-semibold text-text-primary mb-3">Willkommen bei KAMANIN</h1>
          <p className="text-sm text-text-secondary mb-6">
            Sie wurden eingeladen, dem KAMANIN Client Portal beizutreten. Klicken Sie auf die Schaltfläche unten, um Ihr Passwort festzulegen und Ihr Konto zu aktivieren.
          </p>
          <button
            type="button"
            onClick={handleAccept}
            className="w-full h-10 rounded-[8px] bg-accent text-white text-sm font-semibold transition-colors hover:bg-accent-hover"
          >
            Einladung annehmen & Passwort setzen
          </button>
        </div>
      </div>
    </div>
  )
}
