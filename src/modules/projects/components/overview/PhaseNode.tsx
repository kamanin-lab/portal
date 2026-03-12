import type { Chapter } from '../../types/project';
import type { ChapterStatus } from '../../types/project';
import { getChapterProgress } from '../../lib/helpers';

interface PhaseNodeProps {
  chapter: Chapter;
  status: ChapterStatus;
  onClick?: () => void;
}

export function PhaseNode({ chapter, status, onClick }: PhaseNodeProps) {
  const stateLabel =
    status === 'completed' ? 'Abgeschlossen' :
    status === 'current' ? 'Aktuell' : '';

  const progress = getChapterProgress(chapter);

  return (
    <button
      onClick={onClick}
      className={`phase-node phase-node--${status} flex-1 flex items-center gap-[9px] px-[10px] py-[7px] rounded-[var(--r-sm)] transition-all duration-[180ms] cursor-pointer border border-transparent`}
      style={status === 'current' ? {
        background: 'rgba(43,24,120,0.07)',
        border: '1px solid rgba(43,24,120,0.15)',
        boxShadow: 'inset 0 0 0 1px rgba(43,24,120,0.06)',
        margin: '-1px 0',
      } : undefined}
    >
      <PhaseNodeDot status={status} />
      <div className="flex flex-col gap-0">
        <span className={`text-[12.5px] font-semibold leading-[1.3] ${
          status === 'completed' ? 'text-[var(--text-primary)]' :
          status === 'current' ? 'text-[var(--accent)] font-bold' :
          'text-[var(--text-tertiary)] font-[450]'
        }`}>
          {chapter.title}
        </span>
        <span className={`text-[10px] mt-[2px] ${
          status === 'current' ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'
        }`}>
          {progress}
        </span>
        {stateLabel && (
          <span className={`text-[9px] font-semibold tracking-[0.03em] mt-[2px] ${
            status === 'completed' ? 'text-[var(--committed)]' :
            status === 'current' ? 'text-[var(--accent)]' :
            'text-[var(--text-tertiary)] opacity-60'
          }`}>
            {stateLabel}
          </span>
        )}
      </div>
    </button>
  );
}

function PhaseNodeDot({ status }: { status: ChapterStatus }) {
  const base = 'flex items-center justify-center flex-shrink-0 rounded-full border-[2.5px] transition-all duration-[220ms]';

  if (status === 'completed') {
    return (
      <div className={`${base} w-[14px] h-[14px] border-[var(--committed)] bg-[var(--committed)]`}>
        <span className="text-[8px] text-white font-bold leading-none">✓</span>
      </div>
    );
  }

  if (status === 'current') {
    return (
      <div
        className={`${base} w-[15px] h-[15px] border-[3px] border-[var(--accent)] bg-[var(--accent)]`}
        style={{ animation: 'phase-pulse 2.4s cubic-bezier(0.4,0,0.6,1) infinite' }}
      >
        <span className="block w-[5px] h-[5px] rounded-full bg-white" />
      </div>
    );
  }

  return (
    <div className={`${base} w-[14px] h-[14px] border-[var(--border)] bg-[var(--surface)]`}>
      <span className="text-[9px] font-semibold text-[var(--text-tertiary)] opacity-50 leading-none">–</span>
    </div>
  );
}
