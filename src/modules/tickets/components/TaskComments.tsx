import { useEffect, useRef } from 'react';
import { MessageBubble } from '@/shared/components/common/MessageBubble';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { CommentInput } from './CommentInput';
import { useTaskComments, usePostComment } from '../hooks/useTaskComments';
import { dict } from '../lib/dictionary';

interface TaskCommentsProps {
  taskId: string;
  onRead?: () => void;
  clientBubbleStyle?: 'solid' | 'light';
}

export function TaskComments({ taskId, onRead, clientBubbleStyle = 'light' }: TaskCommentsProps) {
  const { data: comments = [], isLoading } = useTaskComments(taskId);
  const { mutateAsync: postComment, isPending: isSending } = usePostComment();
  const calledOnRead = useRef(false);

  useEffect(() => {
    if (!isLoading && comments.length >= 0 && !calledOnRead.current) {
      calledOnRead.current = true;
      onRead?.();
    }
  }, [isLoading, comments.length, onRead]);

  async function handleSend(text: string, files?: import('../types/tasks').FileData[]) {
    await postComment({ taskId, comment: text, files });
  }

  return (
    <div className="flex flex-col gap-[12px] pt-[8px]">
      <h3 className="text-[12.5px] font-semibold text-text-secondary uppercase tracking-[0.04em]">
        {dict.labels.commentsTitle}
      </h3>

      {isLoading ? (
        <LoadingSkeleton lines={2} height="56px" />
      ) : comments.length === 0 ? (
        <EmptyState message={dict.labels.noComments} />
      ) : (
        <div className="flex flex-col gap-[10px]">
          {[...comments].reverse().map(comment => {
            const isClient = comment.isFromPortal;
            return (
              <MessageBubble
                key={comment.id}
                role={isClient ? 'client' : 'team'}
                content={comment.text}
                senderName={comment.author.name}
                timestamp={comment.created_at}
                clientBubbleStyle={clientBubbleStyle}
              />
            );
          })}
        </div>
      )}

      <CommentInput taskId={taskId} onSend={handleSend} isSending={isSending} />
    </div>
  );
}
