import { Zap } from 'lucide-react';
import { StatusBadge } from '@/shared/components/common/StatusBadge';
import { TaskActions } from './TaskActions';
import { TaskComments } from './TaskComments';
import { mapStatus } from '../lib/status-mapping';
import { dict } from '../lib/dictionary';
import type { ClickUpTask } from '../types/tasks';

interface Props {
  task: ClickUpTask;
  onClose?: () => void;
  onRead?: () => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function TaskDetail({ task, onRead }: Props) {
  const portalStatus = mapStatus(task.status);

  return (
    <div className="p-6 max-[768px]:p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h1 className="text-[20px] font-bold text-text-primary tracking-[-0.02em] leading-[1.2] flex-1">
          {task.name}
        </h1>
        <div className="shrink-0 mt-1">
          <StatusBadge status={portalStatus} variant="ticket" />
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-3 text-[11.5px] text-text-tertiary mb-5">
        {task.list_name && <span>{task.list_name}</span>}
        {task.created_by_name && (
          <span>{dict.labels.createdBy}: {task.created_by_name}</span>
        )}
        {task.due_date && (
          <span>{dict.labels.dueDate}: {formatDate(task.due_date)}</span>
        )}
        {task.last_activity_at && (
          <span>{dict.labels.lastActivity}: {formatDate(task.last_activity_at)}</span>
        )}
        {task.credits != null && task.credits > 0 && (
          <span className="inline-flex items-center gap-0.5 text-amber-600 font-medium">
            <Zap size={11} className="fill-amber-500 stroke-amber-600" />
            {task.credits % 1 === 0 ? task.credits : task.credits.toFixed(1)} Credits
          </span>
        )}
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-[13.5px] text-text-secondary leading-[1.6] mb-5 whitespace-pre-wrap">
          {task.description}
        </p>
      )}

      {/* Actions */}
      <div className="mb-5">
        <TaskActions taskId={task.clickup_id} status={portalStatus} />
      </div>

      <div className="h-px bg-border-light mb-5" />

      {/* Comments */}
      <TaskComments taskId={task.clickup_id} onRead={onRead} />
    </div>
  );
}
