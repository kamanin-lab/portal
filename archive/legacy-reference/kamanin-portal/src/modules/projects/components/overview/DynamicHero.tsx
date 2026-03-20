import { useNavigate } from 'react-router-dom';
import { Zap, CheckCircle, AlertCircle } from 'lucide-react';
import type { Project } from '../../types/project';
import {
  getNextCheckpoint,
  getNextUpcomingStep,
  getCurrentChapter,
} from '../../lib/helpers';
import { getPhaseColor } from '../../lib/phase-colors';

interface DynamicHeroProps {
  project: Project;
  onOpenStep?: (stepId: string) => void;
  onOpenMessage?: () => void;
}

type HeroPriority = 1 | 2 | 3 | 4;

interface HeroContent {
  priority: HeroPriority;
  eyebrow: string;
  eyebrowPulse: boolean;
  eyebrowIcon: React.ReactNode;
  title: string;
  description: string;
  tint: string;
  phase: string;
  primaryCta?: { label: string; onClick: () => void };
  ghostCta?: { label: string; onClick: () => void };
  summary?: string;
}

export function DynamicHero({ project, onOpenStep, onOpenMessage }: DynamicHeroProps) {
  const navigate = useNavigate();
  const checkpoint = getNextCheckpoint(project);
  const upcomingStep = getNextUpcomingStep(project);
  const currentChapter = getCurrentChapter(project);
  const phaseColor = currentChapter ? getPhaseColor(currentChapter.order) : getPhaseColor(1);

  const hasPriority2Tasks = project.tasksSummary.needsAttention > 0;

  let content: HeroContent;

  if (checkpoint) {
    // Priority 1: awaiting_input step exists
    content = {
      priority: 1,
      eyebrow: 'NÄCHSTER SCHRITT',
      eyebrowPulse: true,
      eyebrowIcon: <AlertCircle size={12} />,
      title: checkpoint.step.title,
      description: checkpoint.step.description,
      tint: phaseColor.light,
      phase: phaseColor.main,
      primaryCta: {
        label: 'Öffnen & prüfen →',
        onClick: () => onOpenStep ? onOpenStep(checkpoint.step.id) : navigate(`/uebersicht/schritt/${checkpoint.step.id}`),
      },
      ghostCta: {
        label: 'Nachricht senden',
        onClick: () => onOpenMessage ? onOpenMessage() : navigate('/nachrichten'),
      },
      summary: `Phase: ${checkpoint.chapter.title} · ${checkpoint.step.updatedAt ? `Zuletzt aktualisiert ${checkpoint.step.updatedAt}` : ''}`,
    };
  } else if (hasPriority2Tasks) {
    // Priority 2: tasks need attention
    content = {
      priority: 2,
      eyebrow: 'JETZT WICHTIG',
      eyebrowPulse: true,
      eyebrowIcon: <AlertCircle size={12} />,
      title: `${project.tasksSummary.needsAttention} Aufgaben warten auf Sie`,
      description: 'Einige Aufgaben benötigen Ihre Eingabe oder Freigabe, bevor wir weitermachen können.',
      tint: '#FFFBEB',
      phase: '#D97706',
      primaryCta: {
        label: 'Aufgaben öffnen →',
        onClick: () => navigate('/aufgaben'),
      },
    };
  } else if (upcomingStep) {
    // Priority 3: next upcoming_locked step
    const upPhase = getPhaseColor(upcomingStep.chapter.order);
    content = {
      priority: 3,
      eyebrow: 'IN VORBEREITUNG',
      eyebrowPulse: false,
      eyebrowIcon: <Zap size={12} />,
      title: upcomingStep.step.title,
      description: upcomingStep.step.description,
      tint: upPhase.light,
      phase: upPhase.main,
      ghostCta: {
        label: 'Nachricht senden',
        onClick: () => onOpenMessage ? onOpenMessage() : navigate('/nachrichten'),
      },
      summary: `Das Team arbeitet daran · ${project.teamWorkingOn.task}`,
    };
  } else {
    // Priority 4: all complete
    content = {
      priority: 4,
      eyebrow: 'ALLES ERLEDIGT',
      eyebrowPulse: false,
      eyebrowIcon: <CheckCircle size={12} />,
      title: 'Ihr Projekt ist abgeschlossen',
      description: 'Alle Phasen wurden erfolgreich abgeschlossen. Herzlichen Glückwunsch!',
      tint: phaseColor.light,
      phase: phaseColor.main,
    };
  }

  return (
    <div
      className="relative overflow-hidden rounded-[var(--r-lg)] mb-[18px]"
      style={{
        background: content.tint,
        border: `1px solid color-mix(in srgb, ${content.phase}, transparent 82%)`,
        padding: '28px 32px 22px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.03)',
        flexShrink: 0,
      }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[4px] rounded-t-[var(--r-lg)] z-[1]"
        style={{
          background: `linear-gradient(90deg, ${content.phase} 0%, color-mix(in srgb, ${content.phase}, transparent 40%) 100%)`,
        }}
      />

      {/* Eyebrow */}
      <div className="flex items-center gap-[6px] mb-[8px]" style={{ color: content.phase }}>
        {content.eyebrowIcon}
        <span className="text-[10px] font-bold tracking-[0.08em] uppercase">{content.eyebrow}</span>
        {content.eyebrowPulse && (
          <span
            className="w-[6px] h-[6px] rounded-full"
            style={{
              background: content.phase,
              animation: 'phase-pulse 2.4s cubic-bezier(0.4,0,0.6,1) infinite',
            }}
          />
        )}
      </div>

      {/* Title */}
      <div className="text-[22px] font-bold text-[var(--text-primary)] tracking-[-0.025em] leading-[1.2] mb-[10px]">
        {content.title}
      </div>

      {/* Description */}
      <div className="text-[13.5px] text-[var(--text-secondary)] leading-[1.6] max-w-[520px] mb-[18px]">
        {content.description}
      </div>

      {/* Actions */}
      {(content.primaryCta || content.ghostCta) && (
        <div className="flex items-center gap-[10px]">
          {content.primaryCta && (
            <button
              onClick={content.primaryCta.onClick}
              className="px-[16px] py-[8px] text-[13px] font-semibold text-white rounded-[var(--r-sm)] transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
              style={{ background: content.phase }}
            >
              {content.primaryCta.label}
            </button>
          )}
          {content.ghostCta && (
            <button
              onClick={content.ghostCta.onClick}
              className="px-[14px] py-[7px] text-[13px] font-medium text-[var(--text-secondary)] border border-[var(--border)] bg-white/60 rounded-[var(--r-sm)] transition-all duration-150 hover:border-[var(--border)] hover:bg-white"
            >
              {content.ghostCta.label}
            </button>
          )}
        </div>
      )}

      {/* Summary line */}
      {content.summary && (
        <div className="text-[11px] text-[var(--text-tertiary)] mt-[14px] opacity-70">
          {content.summary}
        </div>
      )}
    </div>
  );
}
