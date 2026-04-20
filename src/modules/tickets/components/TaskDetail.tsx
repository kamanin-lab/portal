import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { FlashIcon } from '@hugeicons/core-free-icons';
import { StatusBadge } from '@/shared/components/common/StatusBadge';
import { TaskActions } from './TaskActions';
import { CreditApproval } from './CreditApproval';
import { RecommendationApproval } from './RecommendationApproval';
import { TaskComments } from './TaskComments';
import { mapStatus } from '../lib/status-mapping';
import { dict } from '../lib/dictionary';
import { DepartmentChips } from './DepartmentChips';
import type { ClickUpTask } from '../types/tasks';

const DESC_MAX_CHARS = 400;

function DescriptionBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncate = text.length > DESC_MAX_CHARS;
  const display = needsTruncate && !expanded ? text.slice(0, DESC_MAX_CHARS) + '…' : text;

  return (
    <div className="mb-5">
      <p className="text-body text-text-secondary leading-[1.6] whitespace-pre-wrap">
        {display}
      </p>
      {needsTruncate && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-accent font-medium mt-1 hover:underline cursor-pointer"
        >
          {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
        </button>
      )}
    </div>
  );
}

interface Props {
  task: ClickUpTask;
  onClose?: () => void;
  onRead?: () => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function TaskDetail({ task, onClose, onRead }: Props) {
  const portalStatus = mapStatus(task.status);
  const isRecommendation = task.tags?.some((t: { name: string }) => t.name === 'recommendation');

  return (
    <div className="flex flex-col h-full">
      {/* Fixed header zone — title, meta, description, actions */}
      <div className="p-6 max-[768px]:p-4 shrink-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-xl font-bold text-text-primary tracking-[-0.02em] leading-[1.2] flex-1">
            {task.name}
          </h1>
          <div className="shrink-0 mt-1">
            <StatusBadge status={portalStatus} variant="ticket" />
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-3 text-xxs text-text-tertiary mb-5">
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
            <span className="inline-flex items-center gap-0.5 text-text-secondary font-medium">
              <HugeiconsIcon icon={FlashIcon} size={11} className="text-text-tertiary" />
              {task.credits % 1 === 0 ? task.credits : task.credits.toFixed(1)} Credits
            </span>
          )}
        </div>

        {/* Department (Fachbereich) chips */}
        <div className="mb-4">
          <DepartmentChips clickupId={task.clickup_id} departments={task.departments ?? []} />
        </div>

        {/* Description */}
        {task.description && <DescriptionBlock text={task.description} />}

        {/* Credit Approval */}
        {portalStatus === 'awaiting_approval' && task.credits != null && task.credits > 0 && (
          <CreditApproval taskId={task.clickup_id} credits={task.credits} taskName={task.name} approvedCredits={task.approved_credits ?? null} />
        )}

        {/* Recommendation Approval — shown only while pending (has tag + not yet accepted/in progress/done) */}
        {isRecommendation && !['approved', 'in_progress', 'done', 'cancelled'].includes(portalStatus) ? (
          <RecommendationApproval taskId={task.clickup_id} credits={task.credits} onClose={onClose} />
        ) : (
          <div className="mb-5">
            <TaskActions taskId={task.clickup_id} status={portalStatus} />
          </div>
        )}

        <div className="h-px bg-border-light" />
      </div>

      {/* Scrollable comments zone — takes remaining height */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col px-6 max-[768px]:px-4 pb-4">
        <TaskComments taskId={task.clickup_id} onRead={onRead} />
      </div>
    </div>
  );
}
