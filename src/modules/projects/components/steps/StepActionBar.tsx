import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTaskActions } from '@/modules/tickets/hooks/useTaskActions';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';

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
      request_changes: { success: 'Aenderungen wurden angefordert', error: 'Aenderungsanforderung fehlgeschlagen' },
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
    <div className="p-[14px] bg-awaiting-bg border border-awaiting/30 rounded-[var(--r-md)]">
      <div className="flex items-center gap-[12px] flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-text-primary">Bereit fuer Ihre Pruefung</div>
          <div className="text-[12px] text-text-secondary mt-[2px]">
            Bitte pruefen Sie das Dokument und geben Sie Ihr Feedback.
          </div>
        </div>
        {!activeAction && (
          <div className="flex items-center gap-[8px] flex-shrink-0">
            <Button
              onClick={() => setActiveAction('approve')}
              variant="accent"
              size="sm"
              className="bg-committed hover:bg-committed/90 font-semibold"
            >
              Freigeben
            </Button>
            <Button
              onClick={() => setActiveAction('request_changes')}
              variant="outline"
              size="sm"
            >
              Aenderungen anfragen
            </Button>
          </div>
        )}
      </div>

      {activeAction && (
        <div className="mt-[12px] flex flex-col gap-[10px]">
          <Textarea
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder={
              activeAction === 'approve'
                ? 'Optionaler Kommentar zur Freigabe...'
                : 'Bitte beschreiben Sie die gewuenschten Aenderungen...'
            }
            rows={3}
            className="bg-white"
            autoFocus
          />
          <div className="flex items-center justify-end gap-[8px]">
            <Button onClick={handleCancel} disabled={isLoading} variant="outline" size="sm">
              Abbrechen
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
              size="sm"
              className={`font-semibold ${
                activeAction === 'approve'
                  ? 'bg-committed hover:bg-committed/90'
                  : 'bg-text-primary hover:bg-text-primary/90'
              }`}
            >
              {isLoading
                ? 'Wird gesendet...'
                : activeAction === 'approve'
                  ? 'Freigeben'
                  : 'Aenderungen anfragen'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
