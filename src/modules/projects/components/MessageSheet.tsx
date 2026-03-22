import { useState, useMemo } from 'react';
import { SideSheet } from '@/shared/components/ui/SideSheet';
import { Button } from '@/shared/components/ui/button';
import { usePostComment } from '@/modules/tickets/hooks/useTaskComments';
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
  const [message, setMessage] = useState('');
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

  function resetForm() {
    setSelectedTaskId('');
    setMessage('');
  }

  async function handleSend() {
    if (!selectedTaskId || !message.trim() || isSending) return;

    try {
      await postComment({ taskId: selectedTaskId, comment: message.trim() });
      resetForm();
      onClose();
    } catch {
      // usePostComment hook already shows error toast on failure
    }
  }

  function handleClose() {
    if (!isSending) {
      resetForm();
      onClose();
    }
  }

  const canSend = selectedTaskId && message.trim().length > 0 && !isSending;

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
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Ihre Nachricht..."
              rows={6}
              className="w-full px-[12px] py-[8px] text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={isSending}>
              Abbrechen
            </Button>
            <Button variant="accent" onClick={handleSend} disabled={!canSend}>
              {isSending ? 'Wird gesendet...' : 'Senden'}
            </Button>
          </div>
        </div>
      </div>
    </SideSheet>
  );
}
