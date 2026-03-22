import { LogOut } from 'lucide-react'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'
import { useAuth } from '@/shared/hooks/useAuth'
import { ProfileSection } from '@/shared/components/konto/ProfileSection'
import { EmailSection } from '@/shared/components/konto/EmailSection'
import { PasswordSection } from '@/shared/components/konto/PasswordSection'
import { NotificationSection } from '@/shared/components/konto/NotificationSection'

export function KontoPage() {
  const { profile, signOut } = useAuth()

  if (!profile) return null

  return (
    <ContentContainer width="narrow">
      <div className="p-6 max-[768px]:p-4 flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Konto</h1>
          <p className="mt-1 text-text-secondary text-sm">
            Verwalten Sie Ihr Profil und Ihre Benachrichtigungen.
          </p>
        </div>

        <ProfileSection profile={profile} />
        <EmailSection currentEmail={profile.email} />
        <PasswordSection />
        <NotificationSection preferences={profile.notification_preferences} />

        <section className="bg-surface rounded-[14px] border border-border p-5">
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-sm text-awaiting hover:text-awaiting/80 transition-colors"
          >
            <LogOut size={16} />
            Abmelden
          </button>
        </section>
      </div>
    </ContentContainer>
  )
}
