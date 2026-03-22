import { Upload } from 'lucide-react';
import type { Step } from '../../types/project';
import { EmptyState } from '@/shared/components/common/EmptyState';

interface StepFilesTabProps {
  step: Step;
}

export function StepFilesTab({ step }: StepFilesTabProps) {
  return (
    <div className="flex flex-col gap-[4px]">
      {step.files.length === 0 && (
        <EmptyState message="Noch keine Dateien fuer diesen Schritt." />
      )}
      {step.files.map((f, idx) => (
        <div
          key={idx}
          className="flex items-center gap-[10px] px-[12px] py-[10px] rounded-[var(--r-sm)] hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <div className="w-[32px] h-[32px] rounded-[6px] flex items-center justify-center flex-shrink-0 bg-accent-light text-accent">
            <span className="text-[9px] font-bold uppercase">{f.type}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-text-primary truncate">{f.name}</div>
            <div className="text-[11px] text-text-tertiary">{f.size} &middot; {f.date} &middot; {f.author}</div>
          </div>
        </div>
      ))}

      {/* Drop zone */}
      <div className="mt-[12px] border-2 border-dashed border-border rounded-[var(--r-md)] p-[24px] text-center text-[13px] text-text-tertiary hover:border-accent hover:bg-accent-light transition-all cursor-pointer">
        <Upload size={18} className="mx-auto mb-[8px] opacity-60" />
        Dateien hierher ziehen oder <strong className="text-accent">klicken</strong>
      </div>
    </div>
  );
}
