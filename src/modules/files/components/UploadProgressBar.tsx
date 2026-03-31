import { motion } from 'motion/react';

export interface UploadItem {
  id: string;
  name: string;
  loaded: number;
  total: number;
  status: 'uploading' | 'done' | 'error';
}

export function UploadProgressBar({ item }: { item: UploadItem }) {
  const pct = item.total > 0 ? Math.round((item.loaded / item.total) * 100) : 0;
  const loadedMB = (item.loaded / 1024 / 1024).toFixed(1);
  const totalMB = (item.total / 1024 / 1024).toFixed(1);

  return (
    <div className="px-2 py-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-text-secondary truncate max-w-[200px]">{item.name}</span>
        <span className="text-2xs text-text-tertiary ml-2 shrink-0">
          {item.status === 'error'
            ? 'Fehler'
            : item.status === 'done'
            ? 'Fertig'
            : `${loadedMB} / ${totalMB} MB`}
        </span>
      </div>
      <div className="h-1 rounded-full bg-surface-raised overflow-hidden">
        <motion.div
          className={item.status === 'error' ? 'h-full bg-red-500 rounded-full' : 'h-full bg-accent rounded-full'}
          initial={{ width: 0 }}
          animate={{ width: `${item.status === 'done' ? 100 : pct}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>
    </div>
  );
}
