import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, CheckCircle, AlertCircle } from 'lucide-react';
import type { Project } from '../../types/project';
import type { InterpretedProjectOverview } from '../../lib/overview-interpretation';
import { getPhaseColor } from '../../lib/phase-colors';

interface DynamicHeroProps {
  project: Project;
  overview: InterpretedProjectOverview;
  onOpenStep?: (stepId: string) => void;
  onOpenMessage?: () => void;
  onCreateTask?: () => void;
}

type HeroPriority = 1 | 2 | 3 | 4;

interface HeroContent {
  priority: HeroPriority;
  eyebrow: string;
  eyebrowPulse: boolean;
  eyebrowIcon: ReactNode;
  title: string;
  description: string;
  tint: string;
  phase: string;
  primaryCta?: { label: string; onClick: () => void };
  ghostCta?: { label: string; onClick: () => void };
  summary?: string;
}

export function DynamicHero({ project, overview, onOpenStep, onOpenMessage, onCreateTask }: DynamicHeroProps) {
  const navigate = useNavigate();
  const primaryAttention = overview.primaryAttention;
  const upcomingStep = overview.nextMeaningfulStep?.step.status === 'upcoming_locked' ? overview.nextMeaningfulStep : null;
  const currentChapter = overview.currentChapter;
  const phaseColor = currentChapter ? getPhaseColor(currentChapter.order) : getPhaseColor(1);

  let content: HeroContent;

  if (primaryAttention) {
    content = {
      priority: 1,
      eyebrow: 'NÄCHSTER SCHRITT',
      eyebrowPulse: true,
      eyebrowIcon: <AlertCircle size={12} />,
      title: primaryAttention.portalCta || primaryAttention.title,
      description: primaryAttention.description,
      tint: phaseColor.light,
      phase: phaseColor.main,
      primaryCta: {
        label: 'Öffnen & prüfen →',
        onClick: () => onOpenStep ? onOpenStep(primaryAttention.stepId) : navigate(`/projekte/schritt/${primaryAttention.stepId}`),
      },
      ghostCta: {
        label: 'Nachricht senden',
        onClick: () => onOpenMessage ? onOpenMessage() : navigate('/nachrichten'),
      },
      summary: `Phase: ${primaryAttention.chapterTitle}${primaryAttention.lastUpdated ? ` · Zuletzt aktualisiert ${primaryAttention.lastUpdated}` : ''}`,
    };
  } else if (project.tasksSummary.needsAttention > 0) {
    content = {
      priority: 2,
      eyebrow: 'JETZT WICHTIG',
      eyebrowPulse: true,
      eyebrowIcon: <AlertCircle size={12} />,
      title: `${project.tasksSummary.needsAttention} Aufgaben warten auf Sie`,
      description: 'Mindestens ein Schritt braucht Ihre Eingabe oder Freigabe. Öffnen Sie den Überblick oder schreiben Sie uns direkt, wenn etwas unklar ist.',
      tint: getPhaseColor(3).light,
      phase: getPhaseColor(3).main,
      primaryCta: {
        label: 'Nachricht senden',
        onClick: () => onOpenMessage ? onOpenMessage() : navigate('/nachrichten'),
      },
      ghostCta: {
        label: 'Aufgabe erstellen',
        onClick: () => onCreateTask ? onCreateTask() : navigate('/aufgaben'),
      },
    };
  } else if (upcomingStep) {
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
      summary: `Das Team arbeitet daran${project.teamWorkingOn.task ? ` · ${project.teamWorkingOn.task}` : ''}`,
    };
  } else {
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
      className="relative overflow-hidden rounded-[var(--r-lg)] mb-5"
      style={{
        background: content.tint,
        border: `1px solid color-mix(in srgb, ${content.phase}, transparent 82%)`,
        padding: '28px 32px 22px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.03)',
        flexShrink: 0,
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[4px] rounded-t-[var(--r-lg)] z-[1]"
        style={{
          background: `linear-gradient(90deg, ${content.phase} 0%, color-mix(in srgb, ${content.phase}, transparent 40%) 100%)`,
        }}
      />

      <div className="flex items-center gap-1.5 mb-2" style={{ color: content.phase }}>
        {content.eyebrowIcon}
        <span className="text-2xs font-bold tracking-[0.08em] uppercase">{content.eyebrow}</span>
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

      <div className="text-xl font-bold text-[var(--text-primary)] tracking-[-0.025em] leading-[1.2] mb-2.5">
        {content.title}
      </div>

      <div className="text-body text-[var(--text-secondary)] leading-[1.6] max-w-[520px] mb-5">
        {content.description}
      </div>

      {(content.primaryCta || content.ghostCta) && (
        <div className="flex items-center gap-2.5">
          {content.primaryCta && (
            <button
              onClick={content.primaryCta.onClick}
              className="px-4 py-2 text-body font-semibold text-white rounded-[var(--r-sm)] transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
              style={{ background: content.phase }}
            >
              {content.primaryCta.label}
            </button>
          )}
          {content.ghostCta && (
            <button
              onClick={content.ghostCta.onClick}
              className="px-3.5 py-2 text-body font-medium text-[var(--text-secondary)] border border-[var(--border)] bg-white/60 rounded-[var(--r-sm)] transition-all duration-150 hover:border-[var(--border)] hover:bg-white"
            >
              {content.ghostCta.label}
            </button>
          )}
        </div>
      )}

      {content.summary && (
        <div className="text-xxs text-[var(--text-tertiary)] mt-3.5 opacity-70">
          {content.summary}
        </div>
      )}
    </div>
  );
}
