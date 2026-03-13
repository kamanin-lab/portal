import { useNavigate } from 'react-router-dom';
import { Plus, MessageSquare, Upload } from 'lucide-react';
import type { Project } from '../../types/project';

interface QuickActionsProps {
  project: Project;
  onOpenMessage?: () => void;
  onOpenUpload?: () => void;
  onCreateTask?: () => void;
}

export function QuickActions({ project, onOpenMessage, onOpenUpload, onCreateTask }: QuickActionsProps) {
  const navigate = useNavigate();

  // Unread messages: count messages from team (approximation from updates)
  const unreadMessages = project.updates.filter(u => u.type === 'message').length;

  const cards = [
    {
      label: 'Aufgabe erstellen',
      sub: `${project.tasksSummary.total} Aufgaben insgesamt`,
      icon: <Plus size={18} />,
      accent: '#D97706',
      bg: '#FFFBEB',
      count: null,
      countBg: '#D97706',
      onClick: () => onCreateTask ? onCreateTask() : navigate('/aufgaben'),
    },
    {
      label: 'Nachricht senden',
      sub: 'Direkter Kontakt zum Team',
      icon: <MessageSquare size={18} />,
      accent: '#7C3AED',
      bg: '#F5F3FF',
      count: unreadMessages > 0 ? unreadMessages : null,
      countBg: '#7C3AED',
      onClick: () => onOpenMessage ? onOpenMessage() : navigate('/nachrichten'),
    },
    {
      label: 'Datei hochladen',
      sub: 'Dateien teilen',
      icon: <Upload size={18} />,
      accent: '#2563EB',
      bg: '#EFF6FF',
      count: null,
      countBg: '#2563EB',
      onClick: () => onOpenUpload ? onOpenUpload() : navigate('/dateien'),
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-[10px] mb-[24px] max-[768px]:grid-cols-2 max-[420px]:grid-cols-1">
      {cards.map((card) => (
        <QACard key={card.label} {...card} />
      ))}
    </div>
  );
}

interface QACardProps {
  label: string;
  sub: string;
  icon: React.ReactNode;
  accent: string;
  bg: string;
  count: number | null;
  countBg: string;
  onClick: () => void;
}

function QACard({ label, sub, icon, accent, bg, count, countBg, onClick }: QACardProps) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 px-[16px] py-[14px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] cursor-pointer text-left transition-all duration-[180ms] cubic-bezier(0.4,0,0.2,1) hover:-translate-y-px active:translate-y-0"
      style={
        {
          '--qa-accent': accent,
          '--qa-bg': bg,
        } as React.CSSProperties
      }
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = accent;
        (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '';
        (e.currentTarget as HTMLElement).style.boxShadow = '';
      }}
    >
      <div
        className="group-hover:scale-[1.04] w-[38px] h-[38px] rounded-[9px] flex items-center justify-center flex-shrink-0 transition-all duration-[180ms]"
        style={{ background: bg, color: accent }}
        ref={(el) => {
          if (!el) return;
          el.parentElement?.addEventListener('mouseenter', () => {
            el.style.background = accent;
            el.style.color = 'white';
          });
          el.parentElement?.addEventListener('mouseleave', () => {
            el.style.background = bg;
            el.style.color = accent;
          });
        }}
      >
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-[13px] font-semibold text-[var(--text-primary)] leading-[1.3] flex items-center gap-[6px]">
          {label}
          {count !== null && (
            <span
              className="inline-flex items-center justify-center text-[10px] font-bold text-white leading-none rounded-[9px]"
              style={{ background: countBg, minWidth: 18, height: 18, padding: '0 5px' }}
            >
              {count}
            </span>
          )}
        </span>
        <span className="text-[10.5px] text-[var(--text-tertiary)] mt-[2px] leading-[1.3]">{sub}</span>
      </div>
    </button>
  );
}
