// Unified status badge for both the tickets module and the projects module.
// variant="project" uses project step status colors from tokens.css
// variant="ticket" uses portal task status colors

interface StatusBadgeProps {
  status: string;
  variant?: 'project' | 'ticket';
  size?: 'sm' | 'md';
}

const TICKET_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  open:            { bg: 'var(--surface-active)', text: 'var(--text-secondary)', dot: 'var(--text-tertiary)' },
  in_progress:     { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' },
  needs_attention: { bg: '#fff7ed', text: '#c2410c', dot: '#f59e0b' },
  approved:        { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' },
  done:            { bg: 'var(--surface-active)', text: 'var(--text-tertiary)', dot: 'var(--text-tertiary)' },
  on_hold:         { bg: '#faf5ff', text: '#7e22ce', dot: '#a855f7' },
  cancelled:       { bg: 'var(--surface-active)', text: 'var(--text-tertiary)', dot: 'var(--text-tertiary)' },
};

const PROJECT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  committed:       { bg: 'var(--committed-bg)', text: 'var(--committed)', dot: 'var(--committed)' },
  awaiting_input:  { bg: 'var(--awaiting-bg)',  text: 'var(--awaiting)',  dot: 'var(--awaiting)' },
  upcoming_locked: { bg: 'var(--upcoming-bg)',  text: 'var(--upcoming)',  dot: 'var(--upcoming)' },
};

const TICKET_LABELS: Record<string, string> = {
  open:            'Offen',
  in_progress:     'In Bearbeitung',
  needs_attention: 'Ihre Rückmeldung',
  approved:        'Freigegeben',
  done:            'Erledigt',
  on_hold:         'Pausiert',
  cancelled:       'Abgebrochen',
};

const PROJECT_LABELS: Record<string, string> = {
  committed:       'Bestätigt',
  awaiting_input:  'Wartet auf Sie',
  upcoming_locked: 'Ausstehend',
};

export function StatusBadge({ status, variant = 'ticket', size = 'md' }: StatusBadgeProps) {
  const colors = variant === 'ticket'
    ? (TICKET_COLORS[status] ?? TICKET_COLORS.open)
    : (PROJECT_COLORS[status] ?? PROJECT_COLORS.upcoming_locked);

  const label = variant === 'ticket'
    ? (TICKET_LABELS[status] ?? status)
    : (PROJECT_LABELS[status] ?? status);

  const fontSize = size === 'sm' ? '11px' : '12px';
  const padding = size === 'sm' ? '2px 7px' : '3px 9px';

  const borderRadius = variant === 'project' ? 'var(--r-sm)' : 'var(--r-full, 999px)';
  const fontWeight = variant === 'project' ? 600 : 500;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding,
        borderRadius,
        background: colors.bg,
        color: colors.text,
        fontSize,
        fontWeight,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: colors.dot,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
