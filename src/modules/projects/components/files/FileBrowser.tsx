import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Folder01Icon, FolderOpenIcon } from '@hugeicons/core-free-icons';
import { motion } from 'motion/react';
import type { Project } from '../../types/project';
import { useNextcloudFilesByPath } from '../../hooks/useNextcloudFiles';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { getPhaseColor } from '../../lib/phase-colors';
import { FileRow } from './FileRow';
import { FolderView } from './FolderView';

interface FileBrowserProps {
  project: Project;
}

export function FileBrowser({ project }: FileBrowserProps) {
  const [pathSegments, setPathSegments] = useState<string[]>([]);

  if (pathSegments.length > 0) {
    return (
      <FolderView
        project={project}
        pathSegments={pathSegments}
        onNavigate={setPathSegments}
      />
    );
  }

  return (
    <RootView project={project} onOpenFolder={(name) => setPathSegments([name])} />
  );
}

// ---------------------------------------------------------------------------
// RootView — dynamic folders from Nextcloud as large cards, no create/upload
// ---------------------------------------------------------------------------

function RootView({ project, onOpenFolder }: { project: Project; onOpenFolder: (name: string) => void }) {
  const { files, notConfigured, isLoading, error } = useNextcloudFilesByPath(project.id, '');

  if (notConfigured) {
    return (
      <EmptyState
        icon={<HugeiconsIcon icon={FolderOpenIcon} size={28} />}
        message="Dateien sind für dieses Projekt noch nicht konfiguriert."
      />
    );
  }

  if (isLoading) return <LoadingSkeleton lines={3} height="56px" />;
  if (error) return <EmptyState message="Dateien konnten nicht geladen werden." />;

  const folders = files.filter((f) => f.type === 'folder');
  const rootFiles = files.filter((f) => f.type === 'file');

  if (folders.length === 0 && rootFiles.length === 0) {
    return <EmptyState message="Noch keine Dateien in diesem Projekt." />;
  }

  return (
    <div className="mt-4">
      {folders.length > 0 && (
        <div className="grid grid-cols-4 gap-2.5 mb-5 max-[768px]:grid-cols-2">
          {folders.map((f, i) => (
            <motion.button
              key={f.path}
              onClick={() => onOpenFolder(f.name)}
              className="p-3 rounded-[var(--r-md)] border text-left transition-all hover:-translate-y-px"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
              }}
              whileHover={{ borderColor: getPhaseColor((i % 4) + 1).main }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: i * 0.04 }}
            >
              <div className="flex items-center gap-1.5">
                <HugeiconsIcon icon={Folder01Icon} size={14} style={{ color: getPhaseColor((i % 4) + 1).main }} />
                <span className="text-xs font-semibold truncate text-[var(--text-primary)]">
                  {f.name}
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {rootFiles.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {rootFiles.map((f) => (
            <FileRow key={f.path} file={f} projectConfigId={project.id} />
          ))}
        </div>
      )}
    </div>
  );
}
