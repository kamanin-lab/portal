import type { Step } from '../../types/project';
import { TaskComments } from '@/modules/tickets/components/TaskComments';

interface StepDiscussionTabProps {
  step: Step;
}

export function StepDiscussionTab({ step }: StepDiscussionTabProps) {
  return <TaskComments taskId={step.clickupTaskId} clientBubbleStyle="solid" />;
}
