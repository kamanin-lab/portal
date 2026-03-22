import { useNavigate } from 'react-router-dom';
import { FileText, Image, File } from 'lucide-react';
import { EmptyState } from '@/shared/components/common/EmptyState';
import type { FileItem } from '../../types/project';

interface FilesTabProps {
  files: FileItem[];
}

export function FilesTab({ files }: FilesTabProps) {
  const navigate = useNavigate();

  if (files.length === 0) {
    return <EmptyState message="Noch keine Dateien." />;
  }

  const recent = files.slice(0, 8);

  return (
    <div className="flex flex-col">
      {recent.map((f, idx) => (
        <div
          key={idx}
          className="flex items-center gap-[10px] px-[6px] py-[8px] rounded-[var(--r-sm)] cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-hover)]"
        >
          <FileIcon type={f.type} />
          <span className="text-[12.5px] text-[var(--text-primary)] font-medium flex-1 truncate">{f.name}</span>
          <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap">{f.size} · {f.date}</span>
        </div>
      ))}
      {files.length > 8 && (
        <button
          onClick={() => navigate('/dateien')}
          className="inline-flex items-center gap-[4px] text-[12px] text-[var(--accent)] font-medium mt-[10px] px-[6px] py-[4px] transition-opacity hover:underline"
        >
          Alle {files.length} Dateien anzeigen →
        </button>
      )}
    </div>
  );
}

function FileIcon({ type }: { type: FileItem['type'] }) {
  const configs = {
    pdf: { bg: '#FEE2E2', color: '#DC2626', Icon: FileText },
    img: { bg: '#DBEAFE', color: '#2563EB', Icon: Image },
    jpg: { bg: '#DBEAFE', color: '#2563EB', Icon: Image },
    png: { bg: '#DBEAFE', color: '#2563EB', Icon: Image },
    svg: { bg: '#EDE9FE', color: '#7C3AED', Icon: File },
    doc: { bg: '#F0FDF4', color: '#16A34A', Icon: FileText },
  };
  const cfg = configs[type] ?? configs.doc;
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
