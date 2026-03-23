import type { TaskStatus } from '../types/tasks';

// ClickUp status string → portal TaskStatus
// Source of truth for all status normalization.
const STATUS_MAP: Record<string, TaskStatus> = {
  'to do':              'open',
  'open':               'open',
  'in progress':        'in_progress',
  'internal review':    'in_progress',
  'rework':             'in_progress',
  'client review':      'needs_attention',
  'awaiting approval':  'awaiting_approval',
  'approved':           'approved',
  'complete':           'done',
  'done':               'done',
  'on hold':            'on_hold',
  'canceled':           'cancelled',
  'cancelled':          'cancelled',
};

export function mapStatus(clickupStatus: string): TaskStatus {
  const normalized = clickupStatus.toLowerCase().trim();
  return STATUS_MAP[normalized] ?? 'open';
}

// Terminal states — no actions available
export const TERMINAL_STATUSES: TaskStatus[] = ['done', 'cancelled'];

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

// States where primary actions (Approve / Request Changes) are shown
export function needsClientAction(status: TaskStatus): boolean {
  return status === 'needs_attention' || status === 'awaiting_approval';
}
