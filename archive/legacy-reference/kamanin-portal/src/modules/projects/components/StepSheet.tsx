import { SideSheet } from '@/shared/components/ui/SideSheet'
import { StepDetail } from './steps/StepDetail'
import type { Project } from '../types/project'

interface StepSheetProps {
  project: Project
  stepId: string | null
  onClose: () => void
}

export function StepSheet({ project, stepId, onClose }: StepSheetProps) {
  return (
    <SideSheet
      open={!!stepId}
      onClose={onClose}
      title={stepId ? 'Schritt' : ''}
    >
      {stepId ? (
        <StepDetail stepId={stepId} project={project} />
      ) : (
        <div className="flex items-center justify-center h-40 text-text-tertiary text-sm">
          Schritt nicht gefunden
        </div>
      )}
    </SideSheet>
  )
}
