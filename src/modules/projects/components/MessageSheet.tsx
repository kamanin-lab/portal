import { useState, useMemo, useCallback } from 'react';
import { SideSheet } from '@/shared/components/ui/SideSheet';
import { usePostComment } from '@/modules/tickets/hooks/useTaskComments';
import { CommentInput } from '@/modules/tickets/components/CommentInput';
import type { Project } from '../types/project';

interface MessageSheetProps {
  project: Project;
  open: boolean;
  onClose: () => void;
}

interface DestinationOption {
  label: string;
  taskId: string;
}

export function MessageSheet({ project, open, onClose }: MessageSheetProps) {
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const { mutateAsync: postComment, isPending: isSending } = usePostComment();

  const destinations = useMemo(() => {
    const options: DestinationOption[] = [];

    if (project.generalMessageTaskId) {
      options.push({
        label: 'Allgemeine Projektnachricht',
        taskId: project.generalMessageTaskId,
      });
    }

    project.chapters.forEach(chapter => {
      chapter.steps.forEach(step => {
        if (step.status === 'committed') return;
        options.push({
          label: `${chapter.title} — ${step.title}`,
          taskId: step.clickupTaskId,
        });
      });
    });

    return options;
  }, [project]);

  const handleSend = useCallback(async (text: string) => {
    if (!selectedTaskId || !text.trim() || isSending) return;

    try {
      await postComment({ taskId: selectedTaskId, comment: text.trim() });
      setSelectedTaskId('');
      onClose();
    } catch {
      // usePostComment hook already shows error toast on failure
    }
  }, [selectedTaskId, isSending, postComment, onClose]);

  function handleClose() {
    if (!isSending) {
      setSelectedTaskId('');
      onClose();
    }
  }

  return (
    <SideSheet open={open} onClose={handleClose} title="Nachricht senden">
      <div className="p-6">
        <h2 className="text-[18px] font-bold text-[var(--text-primary)] tracking-[-0.02em] mb-1">
          Nachricht senden
        </h2>
        <p className="text-[13px] text-[var(--text-secondary)] mb-6">
          An: KAMANIN Team
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              Bezug
            </label>
            <select
              value={selectedTaskId}
              onChange={e => setSelectedTaskId(e.target.value)}
              className="w-full px-[12px] py-[8px] text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
            >
              <option value="">Bitte wählen...</option>
              {destinations.map(dest => (
                <option key={dest.taskId} value={dest.taskId}>
                  {dest.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              Nachricht
            </label>
            <CommentInput
              onSend={handleSend}
              isSending={isSending}
              placeholder="Ihre Nachricht..."
              showAttachment={false}
              minRows={4}
            />
          </div>
        </div>
      </div>
    </SideSheet>
  );
}
