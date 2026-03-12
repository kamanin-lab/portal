import type { StepStatus } from '../types/project';

// ClickUp raw status string → portal StepStatus
// Simpler than ticket mapping: only 3 portal states
const STEP_STATUS_MAP: Record<string, StepStatus> = {
  'client review':   'awaiting_input',
  'approved':        'committed',
  'complete':        'committed',
  'done':            'committed',
};

export function mapStepStatus(clickupStatus: string): StepStatus {
  const normalized = clickupStatus.toLowerCase().trim();
  return STEP_STATUS_MAP[normalized] ?? 'upcoming_locked';
}
