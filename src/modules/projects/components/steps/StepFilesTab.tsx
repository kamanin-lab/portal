import { HugeiconsIcon } from '@hugeicons/react';
import { Upload04Icon } from '@hugeicons/core-free-icons';
import type { Step } from '../../types/project';
import { EmptyState } from '@/shared/components/common/EmptyState';

interface StepFilesTabProps {
  step: Step;
}

export function StepFilesTab({ step }: StepFilesTabProps) {
  return (
    <div className="flex flex-col gap-1">
      {step.files.length === 0 && (
        <EmptyState message="Noch keine Dateien für diesen Schritt." />
      )}
      {step.files.map((f, idx) => (
        <div
          key={idx}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--r-sm)] hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <div className="w-[32px] h-[32px] rounded-[6px] flex items-center justify-center flex-shrink-0 bg-accent-light text-accent">
            <span className="text-2xs font-bold uppercase">{f.type}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-body font-medium text-text-primary truncate">{f.name}</div>
            <div className="text-xxs text-text-tertiary">{f.size} &middot; {f.date} &middot; {f.author}</div>
          </div>
        </div>
      ))}

      {/* Drop zone */}
      <div className="mt-3 border-2 border-dashed border-border rounded-[var(--r-md)] p-6 text-center text-body text-text-tertiary hover:border-accent hover:bg-accent-light transition-all cursor-pointer">
        <HugeiconsIcon icon={Upload04Icon} size={18} className="mx-auto mb-2 opacity-60" />
        Dateien hierher ziehen oder <strong className="text-accent">klicken</strong>
      </div>
    </div>
  );
}
