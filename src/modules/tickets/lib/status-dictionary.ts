export const STATUS_LABELS: Record<string, string> = {
  needs_attention: 'Ihre Rückmeldung',
  awaiting_approval: 'Kostenfreigabe',
  open: 'Offen',
  in_progress: 'In Bearbeitung',
  approved: 'Freigegeben',
  done: 'Erledigt',
  on_hold: 'Pausiert',
  cancelled: 'Abgebrochen',
  all: 'Alle',
}

export const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Dringend',
  high: 'Hoch',
  normal: 'Normal',
  low: 'Niedrig',
}

export const ACTION_LABELS = {
  approve: 'Freigeben',
  requestChanges: 'Änderungen anfordern',
  pause: 'Pausieren',
  cancel: 'Abbrechen',
  resume: 'Fortsetzen',
}

/** Maps a raw ClickUp status string → portal status key. Case-insensitive. */
export function mapClickUpStatus(clickupStatus: string): string {
  const s = clickupStatus.toLowerCase().trim()
  if (s === 'to do') return 'open'
  if (s === 'in progress' || s === 'internal review' || s === 'rework') return 'in_progress'
  if (s === 'client review') return 'needs_attention'
  if (s === 'awaiting approval') return 'awaiting_approval'
  if (s === 'approved') return 'approved'
  if (s === 'complete' || s === 'done' || s === 'closed') return 'done'
  if (s === 'on hold') return 'on_hold'
  if (s === 'canceled' || s === 'cancelled') return 'cancelled'
  return 'open'
}
