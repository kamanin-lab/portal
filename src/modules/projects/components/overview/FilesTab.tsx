import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { FileTypeIcon } from '../files/FileTypeIcon';
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
          <FileTypeIcon name={`file.${f.type}`} />
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
