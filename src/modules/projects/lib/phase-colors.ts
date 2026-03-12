export interface PhaseColor {
  main: string;
  light: string;
  mid: string;
  text: string;
}

export const PHASE_COLORS: Record<number, PhaseColor> = {
  1: { main: '#7C3AED', light: '#F5F3FF', mid: '#EDE9FE', text: '#6D28D9' },
  2: { main: '#2563EB', light: '#EFF6FF', mid: '#DBEAFE', text: '#1D4ED8' },
  3: { main: '#D97706', light: '#FFFBEB', mid: '#FEF3C7', text: '#B45309' },
  4: { main: '#059669', light: '#ECFDF5', mid: '#D1FAE5', text: '#047857' },
};

export function getPhaseColor(order: number): PhaseColor {
  return PHASE_COLORS[order] ?? PHASE_COLORS[1];
}
