import { useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  PlusSignIcon, Message01Icon, Upload04Icon, ArrowUpRight01Icon,
  PaintBrush01Icon, Video01Icon, Mail01Icon, GlobeIcon, Link01Icon,
} from '@hugeicons/core-free-icons';
import type { InterpretedProjectOverview } from '../../lib/overview-interpretation';
import { toCardModel, type QuickActionCardModel } from '../../lib/quick-action-helpers';

/** Map icon token strings (from DB or hardcoded) to Hugeicons components */
function resolveIcon(token: string): React.ReactNode {
  const iconMap: Record<string, React.ReactNode> = {
    'message-square': <HugeiconsIcon icon={Message01Icon} size={18} />,
    'upload': <HugeiconsIcon icon={Upload04Icon} size={18} />,
    'link': <HugeiconsIcon icon={Link01Icon} size={18} />,
    'external-link': <HugeiconsIcon icon={ArrowUpRight01Icon} size={18} />,
    'figma': <HugeiconsIcon icon={PaintBrush01Icon} size={18} />,
    'video': <HugeiconsIcon icon={Video01Icon} size={18} />,
    'mail': <HugeiconsIcon icon={Mail01Icon} size={18} />,
    'globe': <HugeiconsIcon icon={GlobeIcon} size={18} />,
    'plus': <HugeiconsIcon icon={PlusSignIcon} size={18} />,
    'primary_cta': <HugeiconsIcon icon={PlusSignIcon} size={18} />,
    'general_message': <HugeiconsIcon icon={Message01Icon} size={18} />,
    'files': <HugeiconsIcon icon={Upload04Icon} size={18} />,
    'create_task': <HugeiconsIcon icon={PlusSignIcon} size={18} />,
  };
  return iconMap[token] ?? <HugeiconsIcon icon={ArrowUpRight01Icon} size={18} />;
}

interface QuickActionsProps {
  overview: InterpretedProjectOverview;
  onOpenStep?: (stepId: string) => void;
  onOpenMessage?: () => void;
  onOpenUpload?: () => void;
  onCreateTask?: () => void;
}

export function QuickActions({ overview, onOpenStep, onOpenMessage, onOpenUpload, onCreateTask }: QuickActionsProps) {
  const navigate = useNavigate();

  const cards = overview.quickActions
    .filter(card => card.isEnabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(card => toCardModel(
      card,
      overview.primaryAttention?.stepId ?? null,
      resolveIcon,
      {
        openStep: (stepId) => onOpenStep ? onOpenStep(stepId) : navigate(`/projekte/schritt/${stepId}`),
        openMessage: () => onOpenMessage ? onOpenMessage() : navigate('/nachrichten'),
        openUpload: () => onOpenUpload ? onOpenUpload() : navigate('/dateien'),
        createTask: () => onCreateTask ? onCreateTask() : navigate('/aufgaben'),
        openExternal: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
      },
    ));

  return (
    <div className="grid grid-cols-3 gap-2.5 mb-6 max-[768px]:grid-cols-2 max-[420px]:grid-cols-1">
      {cards.map((card) => (
        <QACard key={card.id} {...card} />
      ))}
    </div>
  );
}

function QACard({ label, sub, icon, accent, bg, count, countBg, onClick }: QuickActionCardModel) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 px-4 py-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] cursor-pointer text-left transition-all duration-[180ms] hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-[var(--qa-accent)] active:translate-y-0"
      style={
        {
          '--qa-accent': accent,
          '--qa-bg': bg,
        } as React.CSSProperties
      }
    >
      <div
        className="w-[38px] h-[38px] rounded-[9px] flex items-center justify-center flex-shrink-0 transition-all duration-[180ms] group-hover:scale-[1.04] bg-[var(--qa-bg)] text-[var(--qa-accent)] group-hover:bg-[var(--qa-accent)] group-hover:text-white"
      >
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-body font-semibold text-[var(--text-primary)] leading-[1.3] flex items-center gap-1.5">
          {label}
          {count !== null && (
            <span
              className="inline-flex items-center justify-center text-2xs font-bold text-white leading-none rounded-[9px]"
              style={{ background: countBg, minWidth: 18, height: 18, padding: '0 5px' }}
            >
              {count}
            </span>
          )}
        </span>
        <span className="text-2xs text-[var(--text-tertiary)] mt-0.5 leading-[1.3]">{sub}</span>
      </div>
    </button>
  );
}
