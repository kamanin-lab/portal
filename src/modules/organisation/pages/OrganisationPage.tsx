import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'
import { useOrg } from '@/shared/hooks/useOrg'
import { OrgInfoSection } from '../components/OrgInfoSection'
import { OrgCreditHistorySection } from '../components/OrgCreditHistorySection'
import { DepartmentsSection } from '../components/DepartmentsSection'
import { TeamSection } from '../components/TeamSection'
import { RolesInfoSection } from '../components/RolesInfoSection'

export function OrganisationPage() {
  const { isAdmin, isLoading } = useOrg()
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    const el = document.querySelector(hash)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash, isLoading])

  if (isLoading) return null
  if (!isAdmin && !isLoading) return <Navigate to="/tickets" replace />

  return (
    <ContentContainer width="narrow">
      <div className="p-6 max-[768px]:p-4 flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Ihre Organisation</h1>
          <p className="mt-1 text-text-secondary text-sm">
            Verwalten Sie Organisation, Team und Einladungen.
          </p>
        </div>

        <OrgInfoSection />
        <OrgCreditHistorySection />
        <DepartmentsSection />
        <TeamSection />
        <RolesInfoSection />
      </div>
    </ContentContainer>
  )
}
