import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTaskActions } from '@/modules/tickets/hooks/useTaskActions';

interface StepActionBarProps {
  taskId: string;
  projectId: string;
  onSuccess?: () => void;
}

export function StepActionBar({ taskId, projectId, onSuccess }: StepActionBarProps) {
  const [activeAction, setActiveAction] = useState<'approve' | 'request_changes' | null>(null);
  const [commentText, setCommentText] = useState('');

  const queryClient = useQueryClient();
  const { approveTask, requestChanges, isLoading } = useTaskActions({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setActiveAction(null);
      setCommentText('');
      onSuccess?.();
    },
    toastLabels: {
      approve:         { success: 'Schritt wurde freigegeben',     error: 'Freigabe fehlgeschlagen' },
      request_changes: { success: 'Änderungen wurden angefordert', error: 'Änderungsanforderung fehlgeschlagen' },
    },
  });

  function handleSubmit() {
    if (isLoading) return;
    if (activeAction === 'approve') {
      approveTask(taskId, commentText.trim() || undefined);
    } else if (activeAction === 'request_changes') {
      if (!commentText.trim()) return;
      requestChanges(taskId, commentText.trim());
    }
  }

  function handleCancel() {
    setActiveAction(null);
    setCommentText('');
  }

  const isSubmitDisabled =
    isLoading || (activeAction === 'request_changes' && !commentText.trim());

  return (
    <div className="p-[14px] bg-[var(--awaiting-bg)] border border-[var(--awaiting)] border-opacity-30 rounded-[var(--r-md)]">
      <div className="flex items-center gap-[12px] flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-[var(--text-primary)]">Bereit für Ihre Prüfung</div>
          <div className="text-[12px] text-[var(--text-secondary)] mt-[2px]">
            Bitte prüfen Sie das Dokument und geben Sie Ihr Feedback.
          </div>
        </div>
        {!activeAction && (
          <div className="flex items-center gap-[8px] flex-shrink-0">
            <button
              onClick={() => setActiveAction('approve')}
              className="px-[14px] py-[7px] text-[13px] font-semibold text-white bg-[var(--committed)] rounded-[var(--r-sm)] hover:opacity-90 transition-opacity"
            >
              Freigeben
            </button>
            <button
              onClick={() => setActiveAction('request_changes')}
              className="px-[12px] py-[6px] text-[13px] text-[var(--text-secondary)] border border-[var(--border)] bg-white rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              Änderungen anfragen
            </button>
          </div>
        )}
      </div>

      {activeAction && (
        <div className="mt-[12px] flex flex-col gap-[10px]">
          <textarea
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder={
              activeAction === 'approve'
                ? 'Optionaler Kommentar zur Freigabe...'
                : 'Bitte beschreiben Sie die gewünschten Änderungen...'
            }
            rows={3}
            className="w-full px-[12px] py-[8px] text-[13px] bg-white border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
            autoFocus
          />
          <div className="flex items-center justify-end gap-[8px]">
            <button
              onClick={handleCancel}
              disabled={isLoading}
              className="px-[12px] py-[6px] text-[13px] text-[var(--text-secondary)] border border-[var(--border)] bg-white rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
              className={`px-[14px] py-[7px] text-[13px] font-semibold text-white rounded-[var(--r-sm)] transition-opacity ${
                activeAction === 'approve'
                  ? 'bg-[var(--committed)]'
                  : 'bg-[var(--text-primary)]'
              } ${isSubmitDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
            >
              {isLoading
                ? 'Wird gesendet...'
                : activeAction === 'approve'
                  ? 'Freigeben'
                  : 'Änderungen anfragen'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
