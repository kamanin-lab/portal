import { useState } from 'react';
import { ConfirmDialog } from '@/shared/components/common/ConfirmDialog';
import { useTaskActions } from '../hooks/useTaskActions';
import { isTerminal } from '../lib/status-mapping';
import { dict } from '../lib/dictionary';
import type { TaskAction } from '../types/tasks';

interface TaskActionsProps {
  taskId: string;
  status: string;
}

export function TaskActions({ taskId, status }: TaskActionsProps) {
  const { approveTask, requestChanges, putOnHold, cancelTask, isLoading } = useTaskActions();
  const [confirm, setConfirm] = useState<TaskAction | null>(null);

  if (isTerminal(status as import('../types/tasks').TaskStatus)) return null;

  const needsAttention = status === 'needs_attention';

  async function run(action: TaskAction) {
    setConfirm(null);
    if (action === 'approve') await approveTask(taskId);
    else if (action === 'request_changes') await requestChanges(taskId);
    else if (action === 'put_on_hold') await putOnHold(taskId);
    else if (action === 'cancel') await cancelTask(taskId);
  }

  return (
    <div className="flex flex-col gap-[10px]">
      {needsAttention && (
        <div className="flex items-center gap-[8px] p-[14px] bg-awaiting-bg border border-awaiting rounded-[var(--r-md)] border-opacity-40 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-text-primary">{dict.labels.filterAttention}</div>
            <div className="text-[12px] text-text-secondary mt-[1px]">{dict.dialogs.descPlaceholder}</div>
          </div>
          <div className="flex items-center gap-[8px] flex-shrink-0">
            <button
              onClick={() => run('approve')}
              disabled={isLoading}
              className="px-[14px] py-[7px] text-[13px] font-semibold text-white bg-committed rounded-[var(--r-sm)] hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {dict.actions.approve}
            </button>
            <button
              onClick={() => run('request_changes')}
              disabled={isLoading}
              className="px-[12px] py-[6px] text-[13px] text-text-secondary border border-border bg-surface rounded-[var(--r-sm)] hover:bg-surface-hover transition-colors disabled:opacity-50 cursor-pointer"
            >
              {dict.actions.requestChanges}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-[8px]">
        <button
          onClick={() => setConfirm('put_on_hold')}
          disabled={isLoading}
          className="px-[12px] py-[6px] text-[12px] text-text-secondary border border-border bg-surface rounded-[var(--r-sm)] hover:bg-surface-hover transition-colors disabled:opacity-50 cursor-pointer"
        >
          {dict.actions.hold}
        </button>
        <button
          onClick={() => setConfirm('cancel')}
          disabled={isLoading}
          className="px-[12px] py-[6px] text-[12px] text-text-secondary border border-border bg-surface rounded-[var(--r-sm)] hover:bg-surface-hover transition-colors disabled:opacity-50 cursor-pointer"
        >
          {dict.actions.cancel}
        </button>
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
