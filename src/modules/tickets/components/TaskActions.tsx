import { useState } from 'react';
import { ConfirmDialog } from '@/shared/components/common/ConfirmDialog';
import { Button } from '@/shared/components/ui/button';
import { useTaskActions } from '../hooks/useTaskActions';
import { isTerminal } from '../lib/status-mapping';
import { dict } from '../lib/dictionary';
import type { TaskAction } from '../types/tasks';
import { useOrg } from '@/shared/hooks/useOrg'

interface TaskActionsProps {
  taskId: string;
  status: string;
}

export function TaskActions({ taskId, status }: TaskActionsProps) {
  const { approveTask, requestChanges, putOnHold, resumeTask, cancelTask, isLoading } = useTaskActions();
  const { isViewer } = useOrg()
  const [confirm, setConfirm] = useState<TaskAction | null>(null);

  if (isTerminal(status as import('../types/tasks').TaskStatus)) return null;
  if (isViewer) return null

  const needsAttention = status === 'needs_attention';
  const isOnHold = status === 'on_hold';

  async function run(action: TaskAction) {
    setConfirm(null);
    if (action === 'approve') await approveTask(taskId);
    else if (action === 'request_changes') await requestChanges(taskId);
    else if (action === 'put_on_hold') await putOnHold(taskId);
    else if (action === 'resume') await resumeTask(taskId);
    else if (action === 'cancel') await cancelTask(taskId);
  }

  return (
    <div className="flex flex-col gap-2.5">
      {needsAttention && (
        <div className="flex items-center gap-2 p-3.5 bg-[var(--phase-2-light)] border border-[var(--phase-2)]/30 rounded-[var(--r-md)] flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="text-body font-semibold text-text-primary">{dict.labels.filterAttention}</div>
            <div className="text-xs text-text-secondary mt-0.5">{dict.dialogs.descPlaceholder}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              onClick={() => run('approve')}
              disabled={isLoading}
              size="sm"
              className="bg-committed hover:bg-committed/90 font-semibold"
            >
              {dict.actions.approve}
            </Button>
            <Button
              onClick={() => run('request_changes')}
              disabled={isLoading}
              variant="outline"
              size="sm"
            >
              {dict.actions.requestChanges}
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {isOnHold ? (
          <Button
            onClick={() => run('resume')}
            disabled={isLoading}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            {dict.actions.resume}
          </Button>
        ) : (
          <Button
            onClick={() => setConfirm('put_on_hold')}
            disabled={isLoading}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            {dict.actions.hold}
          </Button>
        )}
        <Button
          onClick={() => setConfirm('cancel')}
          disabled={isLoading}
          variant="outline"
          size="sm"
          className="text-xs"
        >
          {dict.actions.cancel}
        </Button>
      </div>

      <ConfirmDialog
        open={confirm === 'put_on_hold'}
        title={dict.dialogs.holdTitle}
        message={dict.dialogs.holdMessage}
        confirmLabel={dict.dialogs.holdConfirm}
        onConfirm={() => run('put_on_hold')}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        title={dict.dialogs.cancelTitle}
        message={dict.dialogs.cancelMessage}
        confirmLabel={dict.dialogs.cancelConfirm}
        onConfirm={() => run('cancel')}
        onCancel={() => setConfirm(null)}
        destructive
      />
    </div>
  );
}
