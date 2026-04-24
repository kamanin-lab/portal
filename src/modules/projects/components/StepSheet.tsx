import { SideSheet } from '@/shared/components/ui/SideSheet'
import { StepDetail } from './steps/StepDetail'
import { TaskCommentComposer } from '@/modules/tickets/components/TaskComments'
import { getStepById } from '../lib/helpers'
import type { Project } from '../types/project'

interface StepSheetProps {
  project: Project
  stepId: string | null
  onClose: () => void
  onOpenTask?: (taskId: string) => void
}

export function StepSheet({ project, stepId, onClose, onOpenTask }: StepSheetProps) {
  const found = stepId ? getStepById(stepId, project) : null

  return (
    <SideSheet
      open={!!stepId}
      onClose={onClose}
      title={found?.step.title ?? 'Schritt'}
      footer={found?.step ? <TaskCommentComposer taskId={found.step.clickupTaskId} /> : undefined}
    >
      {stepId ? (
        <StepDetail stepId={stepId} project={project} onClose={onClose} onOpenTask={onOpenTask} />
      ) : (
        <div className="flex items-center justify-center h-40 text-text-tertiary text-sm">
          Schritt nicht gefunden
        </div>
      )}
    </SideSheet>
  )
}
