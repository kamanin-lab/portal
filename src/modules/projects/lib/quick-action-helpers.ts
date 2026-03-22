import type { ProjectQuickAction } from '../types/project';

/** Color scheme per destination kind */
export function getCardStyle(kind: ProjectQuickAction['destinationKind']): { accent: string; bg: string } {
  switch (kind) {
    case 'primary_cta': return { accent: '#D97706', bg: '#FFFBEB' };
    case 'general_message': return { accent: '#7C3AED', bg: '#F5F3FF' };
    case 'files': return { accent: '#2563EB', bg: '#EFF6FF' };
    case 'external_link': return { accent: '#0891B2', bg: '#ECFEFF' };
    case 'create_task': default: return { accent: '#D97706', bg: '#FFFBEB' };
  }
}

export interface QuickActionCardModel {
  id: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  accent: string;
  bg: string;
  count: number | null;
  countBg: string;
  onClick: () => void;
}

export interface CardHandlers {
  openStep: (stepId: string) => void;
  openMessage: () => void;
  openUpload: () => void;
  createTask: () => void;
  openExternal: (url: string) => void;
}

export function toCardModel(
  card: ProjectQuickAction,
  primaryStepId: string | null,
  resolveIcon: (token: string) => React.ReactNode,
  handlers: CardHandlers,
): QuickActionCardModel {
  const style = getCardStyle(card.destinationKind);
  const base = {
    id: card.key,
    label: card.label,
    sub: card.subtitle,
    count: card.count ?? null,
    icon: resolveIcon(card.iconToken),
    accent: style.accent,
    bg: style.bg,
    countBg: style.accent,
  };

  switch (card.destinationKind) {
    case 'primary_cta':
      return { ...base, onClick: () => primaryStepId ? handlers.openStep(primaryStepId) : handlers.createTask() };
    case 'general_message':
      return { ...base, onClick: handlers.openMessage };
    case 'files':
      return { ...base, onClick: handlers.openUpload };
    case 'external_link':
      return { ...base, onClick: () => card.url ? handlers.openExternal(card.url) : undefined };
    case 'create_task':
    default:
      return { ...base, onClick: handlers.createTask };
  }
}
