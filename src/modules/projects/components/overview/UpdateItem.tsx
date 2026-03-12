import { Upload, CheckCircle, MessageSquare } from 'lucide-react';
import type { Update, Project } from '../../types/project';

interface UpdateItemProps {
  update: Update;
  project?: Project;
  onOpenStep?: (stepId: string) => void;
}

const iconConfig = {
  file: {
    icon: Upload,
    bg: 'var(--accent-light)',
    color: 'var(--accent)',
  },
  status: {
    icon: CheckCircle,
    bg: '#ECFDF5',
    color: '#059669',
  },
  message: {
    icon: MessageSquare,
    bg: '#F5F3FF',
    color: '#7C3AED',
  },
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
  const cfg = iconConfig[update.type];
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
