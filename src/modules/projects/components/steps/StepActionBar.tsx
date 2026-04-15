import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/shared/hooks/useOrg';
import { useTaskActions } from '@/modules/tickets/hooks/useTaskActions';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import type { Project, StepStatus } from '../../types/project';

interface StepActionBarProps {
  taskId: string;
  projectId: string;
  onSuccess?: () => void;
}

export function StepActionBar({ taskId, projectId, onSuccess }: StepActionBarProps) {
  const [activeAction, setActiveAction] = useState<'approve' | 'request_changes' | null>(null);
  const [commentText, setCommentText] = useState('');

  const queryClient = useQueryClient();
  const { isViewer } = useOrg();
  const { approveTask, requestChanges, isLoading } = useTaskActions({
    onSuccess: async () => {
      // cancelQueries prevents any in-flight refetch from overwriting the optimistic state.
      // Without this, refetchOnWindowFocus or stale-while-revalidate can land AFTER setQueryData
      // and revert the hero card to the old status (project_task_cache is only updated by webhook).
      await queryClient.cancelQueries({ queryKey: ['project', projectId] });
      // Optimistic patch: immediately update step status in project cache
      // so the DynamicHero CTA card updates without waiting for the webhook roundtrip (1-3s).
      // We read activeAction here (before resetting it) to know which status to apply.
      const currentAction = activeAction;
      queryClient.setQueryData(['project', projectId], (old: Project | null | undefined) => {
        if (!old) return old;
        const isApprove = currentAction === 'approve';
        const updatedChapters = old.chapters.map(ch => ({
          ...ch,
          steps: ch.steps.map(step => {
            if (step.clickupTaskId !== taskId) return step;
            return {
              ...step,
              rawStatus: isApprove ? 'approved' : 'in progress',
              status: (isApprove ? 'committed' : 'upcoming_locked') as StepStatus,
              isClientReview: false,
            };
          }),
        }));
        const newNeedsAttention = updatedChapters.reduce(
          (count, ch) => count + ch.steps.filter(s => s.status === 'awaiting_input').length,
          0,
        );
        return {
          ...old,
          chapters: updatedChapters,
          tasksSummary: {
            ...old.tasksSummary,
            needsAttention: newNeedsAttention,
          },
        };
      });

      // Invalidate comments so any comment posted during approve/request_changes
      // appears immediately (comment_cache is written synchronously by update-task-status).
      // Do NOT invalidate ['project', projectId] here — project_task_cache is only updated
      // by the ClickUp webhook (15-20s later). The realtime subscription in useProject handles
      // eventual sync. Invalidating early would overwrite the optimistic patch with stale data.
      queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
      setActiveAction(null);
      setCommentText('');
      onSuccess?.();
    },
    toastLabels: {
      approve:         { success: 'Schritt wurde freigegeben',     error: 'Freigabe fehlgeschlagen' },
      request_changes: { success: 'Änderungen wurden angefordert', error: 'Aenderungsanforderung fehlgeschlagen' },
    },
  });

  if (isViewer) return null;

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
    <div className="p-3.5 bg-awaiting-bg border border-awaiting/30 rounded-[var(--r-md)]">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-body font-medium text-text-primary">Bereit für Ihre Prüfung</div>
          <div className="text-xs text-text-secondary mt-0.5">
            Bitte prüfen Sie das Dokument und geben Sie Ihr Feedback.
          </div>
        </div>
        {!activeAction && (
          <div className="flex items-center gap-2 flex-shrink-0">
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
              Änderungen anfragen
            </Button>
          </div>
        )}
      </div>

      {activeAction && (
        <div className="mt-3 flex flex-col gap-2.5">
          <Textarea
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder={
              activeAction === 'approve'
                ? 'Optionaler Kommentar zur Freigabe...'
                : 'Bitte beschreiben Sie die gewünschten Änderungen...'
            }
            rows={3}
            className="bg-white"
            autoFocus
          />
          <div className="flex items-center justify-end gap-2">
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
                  : 'Änderungen anfragen'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
