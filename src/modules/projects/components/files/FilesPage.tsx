import { useState } from 'react';
import { FileText, Image, File } from 'lucide-react';
import type { Project, FileItem } from '../../types/project';
import { getPhaseColor } from '../../lib/phase-colors';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';

interface EnrichedFile extends FileItem {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  stepTitle: string;
}

interface FilesPageProps {
  project: Project;
}

export function FilesPage({ project }: FilesPageProps) {
  const [chapterFilter, setChapterFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Collect all files
  const allFiles: EnrichedFile[] = project.chapters.flatMap(ch =>
    ch.steps.flatMap(s =>
      s.files.map(f => ({
        ...f,
        chapterId: ch.id,
        chapterTitle: ch.title,
        chapterOrder: ch.order,
        stepTitle: s.title,
      }))
    )
  );

  // Apply filters
  let filtered = allFiles;
  if (chapterFilter !== 'all') {
    filtered = filtered.filter(f => f.chapterId === chapterFilter);
  }
  if (typeFilter !== 'all') {
    filtered = filtered.filter(f => {
      if (typeFilter === 'img') return ['img', 'jpg', 'png', 'svg'].includes(f.type);
      if (typeFilter === 'pdf') return f.type === 'pdf';
      if (typeFilter === 'doc') return ['doc'].includes(f.type);
      return true;
    });
  }

  return (
    <ContentContainer width="narrow">
    <div className="p-[24px] max-[768px]:p-[16px]">
      <h1 className="text-[1.2rem] font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-[20px]">
        Dateien
      </h1>

      {/* Phase folder cards */}
      <div className="grid grid-cols-4 gap-[10px] mb-[20px] max-[768px]:grid-cols-2">
        {project.chapters.map(ch => {
          const pc = getPhaseColor(ch.order);
          const count = allFiles.filter(f => f.chapterId === ch.id).length;
          const isActive = chapterFilter === ch.id;
          return (
            <button
              key={ch.id}
              onClick={() => setChapterFilter(isActive ? 'all' : ch.id)}
              className="p-[12px] rounded-[var(--r-md)] border text-left transition-all hover:-translate-y-px"
              style={{
                background: isActive ? pc.light : 'var(--surface)',
                borderColor: isActive ? pc.main : 'var(--border)',
              }}
            >
              <div className="text-[12px] font-semibold mb-[2px]" style={{ color: pc.text }}>
                {ch.title}
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)]">{count} Dateien</div>
            </button>
          );
        })}
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-[6px] mb-[16px] flex-wrap">
        {(['all', 'img', 'pdf', 'doc'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-[10px] py-[5px] text-[11.5px] font-medium rounded-[var(--r-sm)] border transition-colors ${
              typeFilter === t
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent)]'
            }`}
          >
            {t === 'all' ? 'Alle' : t === 'img' ? 'Bilder' : t === 'pdf' ? 'PDFs' : 'Dokumente'}
          </button>
        ))}
      </div>

      {/* File table */}
      {filtered.length === 0 ? (
        <p className="text-[13px] text-[var(--text-tertiary)]">Keine Dateien gefunden.</p>
      ) : (
        <div className="flex flex-col gap-[2px]">
          {filtered.map((f, idx) => {
            const pc = getPhaseColor(f.chapterOrder);
            return (
              <div
                key={idx}
                className="flex items-center gap-[10px] px-[10px] py-[10px] rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
              >
                <FileTypeIcon type={f.type} />
                <span className="flex-1 text-[13px] font-medium text-[var(--text-primary)] truncate">{f.name}</span>
                <span
                  className="text-[10.5px] font-medium px-[6px] py-[2px] rounded-[var(--r-sm)] flex-shrink-0"
                  style={{ background: pc.mid, color: pc.text }}
                >
                  {f.chapterTitle}
                </span>
                <span className="text-[11px] text-[var(--text-tertiary)] whitespace-nowrap hidden md:block">{f.size}</span>
                <span className="text-[11px] text-[var(--text-tertiary)] whitespace-nowrap hidden md:block">{f.date}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </ContentContainer>
  );
}

function FileTypeIcon({ type }: { type: FileItem['type'] }) {
  const map = {
    pdf: { bg: '#FEE2E2', color: '#DC2626', Icon: FileText },
    img: { bg: '#DBEAFE', color: '#2563EB', Icon: Image },
    jpg: { bg: '#DBEAFE', color: '#2563EB', Icon: Image },
    png: { bg: '#DBEAFE', color: '#2563EB', Icon: Image },
    svg: { bg: '#EDE9FE', color: '#7C3AED', Icon: File },
    doc: { bg: '#F0FDF4', color: '#16A34A', Icon: FileText },
  };
  const cfg = map[type] ?? map.doc;
  const Icon = cfg.Icon;
  return (
    <div
      className="w-[28px] h-[28px] rounded-[6px] flex items-center justify-center flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <Icon size={13} />
    </div>
  );
}
