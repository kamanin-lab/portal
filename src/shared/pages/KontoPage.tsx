import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Logout03Icon } from '@hugeicons/core-free-icons'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'
import { useAuth } from '@/shared/hooks/useAuth'
import { ProfileSection } from '@/shared/components/konto/ProfileSection'
import { EmailSection } from '@/shared/components/konto/EmailSection'
import { PasswordSection } from '@/shared/components/konto/PasswordSection'
import { NotificationSection } from '@/shared/components/konto/NotificationSection'
import { Button } from '@/shared/components/ui/button'

export function KontoPage() {
  const { profile, signOut } = useAuth()
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    const el = document.querySelector(hash)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

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
          <Button
            onClick={signOut}
            variant="ghost"
            size="sm"
            className="text-awaiting hover:text-awaiting/80 hover:bg-transparent p-0"
          >
            <HugeiconsIcon icon={Logout03Icon} size={16} />
            Abmelden
          </Button>
        </section>
      </div>
    </ContentContainer>
  )
}
