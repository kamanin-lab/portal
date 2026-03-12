import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SideSheet } from '@/shared/components/ui/SideSheet';
import type { Project } from '../types/project';
import { getChapterProgress, statusLabel } from '../lib/helpers';
import { getPhaseColor } from '../lib/phase-colors';

interface SchritteSheetProps {
  project: Project;
  kapitelId: string | null;
  onClose: () => void;
  onOpenStep: (stepId: string) => void;
}

export function SchritteSheet({ project, kapitelId, onClose, onOpenStep }: SchritteSheetProps) {
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(kapitelId);

  // Sync when kapitelId changes from URL (e.g. navigating back)
  useEffect(() => {
    if (kapitelId) setExpandedChapterId(kapitelId);
  }, [kapitelId]);

  return (
    <SideSheet open={!!kapitelId} onClose={onClose} title="Projektablauf">
      <div className="p-[24px] max-[768px]:p-[16px]">
        <h2 className="text-[1rem] font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-[20px]">
          Projektablauf
        </h2>

        <div className="flex flex-col gap-[8px]">
          {project.chapters.map(chapter => (
            <ChapterRow
              key={chapter.id}
              chapter={chapter}
              isExpanded={expandedChapterId === chapter.id}
              onToggle={() =>
                setExpandedChapterId(prev => (prev === chapter.id ? null : chapter.id))
              }
              onOpenStep={onOpenStep}
            />
          ))}
        </div>
      </div>
    </SideSheet>
  );
}

function ChapterRow({
  chapter,
  isExpanded,
  onToggle,
  onOpenStep,
}: {
  chapter: Project['chapters'][number];
  isExpanded: boolean;
  onToggle: () => void;
  onOpenStep: (stepId: string) => void;
}) {
  const progress = getChapterProgress(chapter);
  const pc = getPhaseColor(chapter.order);

  return (
    <div className="border border-[var(--border-light)] rounded-[var(--r-md)] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-[12px] px-[14px] py-[12px] hover:bg-[var(--surface-hover)] transition-colors text-left"
      >
        <span
          className="w-[10px] h-[10px] rounded-full flex-shrink-0"
          style={{ background: pc.main }}
        />
        <span className="flex-1 text-[13.5px] font-semibold text-[var(--text-primary)]">
          {chapter.title}
        </span>
        <span className="text-[11px] text-[var(--text-tertiary)]">{progress}</span>
        {isExpanded ? (
          <ChevronDown size={14} className="text-[var(--text-tertiary)]" />
        ) : (
          <ChevronRight size={14} className="text-[var(--text-tertiary)]" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-[var(--border-light)]">
          {chapter.steps.map((step, idx) => (
            <div
              key={step.id}
              onClick={() => onOpenStep(step.id)}
              className={`flex items-center gap-[12px] px-[18px] py-[11px] cursor-pointer hover:bg-[var(--surface-hover)] transition-colors ${
                idx > 0 ? 'border-t border-[var(--border-light)]' : ''
              }`}
            >
              <StepStatusDot status={step.status} />
              <span className="flex-1 text-[13px] text-[var(--text-primary)]">{step.title}</span>
              <span
                className={`text-[11px] font-medium px-[6px] py-[2px] rounded-[var(--r-sm)] ${
                  step.status === 'committed'
                    ? 'bg-[var(--committed-bg)] text-[var(--committed)]'
                    : step.status === 'awaiting_input'
                    ? 'bg-[var(--awaiting-bg)] text-[var(--awaiting)]'
                    : 'bg-[var(--upcoming-bg)] text-[var(--upcoming)]'
                }`}
              >
                {statusLabel(step.status)}
              </span>
              {step.updatedAt && (
                <span className="text-[10.5px] text-[var(--text-tertiary)] hidden md:block">
                  {step.updatedAt}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepStatusDot({ status }: { status: string }) {
  if (status === 'committed') {
    return (
      <div className="w-[14px] h-[14px] rounded-full bg-[var(--committed)] flex items-center justify-center flex-shrink-0">
        <span className="text-[8px] text-white font-bold">✓</span>
      </div>
    );
  }
  if (status === 'awaiting_input') {
    return (
      <div
        className="w-[14px] h-[14px] rounded-full border-[2.5px] border-[var(--awaiting)] bg-[var(--awaiting)] flex-shrink-0"
        style={{ animation: 'phase-pulse 2.4s cubic-bezier(0.4,0,0.6,1) infinite' }}
      />
    );
  }
  return (
    <div className="w-[14px] h-[14px] rounded-full border-[2px] border-[var(--border)] bg-[var(--surface)] flex-shrink-0" />
  );
}
