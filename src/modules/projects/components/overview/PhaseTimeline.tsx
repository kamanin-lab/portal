import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import type { Project } from '../../types/project';
import { getChapterStatus } from '../../lib/helpers';
import { useBreakpoint } from '@/shared/hooks/useBreakpoint';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { PhaseNode } from './PhaseNode';
import { PhaseConnector } from './PhaseConnector';

interface PhaseTimelineProps {
  project: Project;
  onChapterClick?: (chapterId: string) => void;
}

export function PhaseTimeline({ project, onChapterClick }: PhaseTimelineProps) {
  const chapters = project.chapters;
  const { isMobile } = useBreakpoint();

  const [activeIndex, setActiveIndex] = useState(() => {
    const idx = chapters.findIndex(ch => getChapterStatus(ch, project) === 'current');
    return idx >= 0 ? idx : 0;
  });
  const [direction, setDirection] = useState<1 | -1>(1);

  const goPrev = () => { setDirection(-1); setActiveIndex(i => Math.max(0, i - 1)); };
  const goNext = () => { setDirection(1); setActiveIndex(i => Math.min(chapters.length - 1, i + 1)); };

  const container = "mb-3 px-1.5 py-2 bg-[var(--surface)] border border-[var(--border-light)] rounded-[var(--r-md)]";

  if (isMobile) {
    return (
      <div className={container}>
        <div className="flex items-center gap-3">
          <button
            onClick={goPrev}
            disabled={activeIndex === 0}
            className="p-1 rounded-[var(--r-sm)] disabled:opacity-30 hover:bg-[var(--surface-hover)] transition-colors"
            aria-label="Vorherige Phase"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={18} color="var(--text-secondary)" />
          </button>

          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={activeIndex}
                custom={direction}
                variants={{
                  enter: (d: number) => ({ x: d * 40, opacity: 0 }),
                  center: { x: 0, opacity: 1 },
                  exit: (d: number) => ({ x: d * -40, opacity: 0 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                <PhaseNode
                  chapter={chapters[activeIndex]}
                  status={getChapterStatus(chapters[activeIndex], project)}
                  onClick={() => onChapterClick?.(chapters[activeIndex].id)}
                  showTooltip={false}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          <button
            onClick={goNext}
            disabled={activeIndex === chapters.length - 1}
            className="p-1 rounded-[var(--r-sm)] disabled:opacity-30 hover:bg-[var(--surface-hover)] transition-colors"
            aria-label="Nächste Phase"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} size={18} color="var(--text-secondary)" />
          </button>
        </div>

        <div className="text-center mt-1">
          <span className="text-2xs text-[var(--text-tertiary)]">
            {activeIndex + 1} / {chapters.length}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={container}>
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-0" style={{ flexShrink: 0 }}>
          {chapters.map((chapter, idx) => {
            const status = getChapterStatus(chapter, project);
            const isLast = idx === chapters.length - 1;
            return (
              <div key={chapter.id} className="flex items-center flex-1">
                <PhaseNode
                  chapter={chapter}
                  status={status}
                  onClick={() => onChapterClick?.(chapter.id)}
                />
                {!isLast && (
                  <PhaseConnector chapter={chapters[idx + 1]} prevChapterOrder={chapter.order} />
                )}
              </div>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
