import { Upload, CheckCircle, MessageSquare, AlertCircle, Clock, Circle, PauseCircle, XCircle } from 'lucide-react';
import type { Update, Project } from '../../types/project';

interface UpdateItemProps {
  update: Update;
  project?: Project;
  onOpenStep?: (stepId: string) => void;
}

function getStatusIcon(rawStatus?: string) {
  const s = (rawStatus || '').toLowerCase().trim();

  if (['approved', 'complete', 'done'].includes(s)) {
    return { icon: CheckCircle, bg: '#ECFDF5', color: '#059669' };
  }
  if (s === 'client review') {
    return { icon: AlertCircle, bg: '#FFFBEB', color: '#D97706' };
  }
  if (['in progress', 'internal review', 'rework'].includes(s)) {
    return { icon: Clock, bg: '#EFF6FF', color: '#2563EB' };
  }
  if (s === 'to do') {
    return { icon: Circle, bg: 'var(--surface-active)', color: 'var(--text-tertiary)' };
  }
  if (s === 'on hold') {
    return { icon: PauseCircle, bg: '#FFF7ED', color: '#EA580C' };
  }
  if (['canceled', 'cancelled'].includes(s)) {
    return { icon: XCircle, bg: '#FEF2F2', color: '#DC2626' };
  }

  return { icon: CheckCircle, bg: '#ECFDF5', color: '#059669' };
}

const typeIconConfig = {
  file: { icon: Upload, bg: 'var(--accent-light)', color: 'var(--accent)' },
  message: { icon: MessageSquare, bg: '#F5F3FF', color: '#7C3AED' },
} as const;

function findStepIdByTitle(title: string, project: Project): string | null {
  const word = title.toLowerCase().split(' ')[0];
  for (const ch of project.chapters) {
    for (const step of ch.steps) {
      if (step.title.toLowerCase().includes(word)) return step.id;
    }
  }
  return null;
}

export function UpdateItem({ update, project, onOpenStep }: UpdateItemProps) {
  const cfg = update.type === 'status'
    ? getStatusIcon(update.rawStatus)
    : typeIconConfig[update.type];
  const Icon = cfg.icon;

  const stepId = project && onOpenStep ? findStepIdByTitle(update.text, project) : null;
  const isClickable = !!stepId;

  return (
    <div
      className={`flex gap-[10px] items-center px-[8px] py-[7px] rounded-[var(--r-sm)] transition-colors duration-[120ms] hover:bg-[var(--surface-hover)] ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
      onClick={isClickable ? () => onOpenStep!(stepId!) : undefined}
    >
      <div
        className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center flex-shrink-0"
        style={{ background: cfg.bg, color: cfg.color }}
      >
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0 flex items-baseline gap-[8px]">
        <span className="text-[12.5px] text-[var(--text-primary)] font-medium leading-[1.35]">
          {update.text}
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap flex-shrink-0">
          {update.time}
        </span>
      </div>
    </div>
  );
}
