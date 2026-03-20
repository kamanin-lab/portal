import { useEffect, useRef } from 'react';
import { MessageBubble } from '@/shared/components/common/MessageBubble';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { CommentInput } from './CommentInput';
import { useSupportTaskChat } from '../hooks/useSupportTaskChat';
import { useAuth } from '@/shared/hooks/useAuth';
import { dict } from '../lib/dictionary';

interface SupportChatProps {
  onRead?: () => void;
}

export function SupportChat({ onRead }: SupportChatProps) {
  const { comments, isLoading, sendMessage, isSending, isConfigured, supportTaskId } = useSupportTaskChat();
  const { profile } = useAuth();
  const calledOnRead = useRef(false);
  const myEmail = profile?.email ?? '';

  useEffect(() => {
    if (!isLoading && !calledOnRead.current) {
      calledOnRead.current = true;
      onRead?.();
    }
  }, [isLoading, onRead]);

  return (
    <div className="flex flex-col h-full p-[24px] max-[768px]:p-[16px]">
      {/* Header */}
      <div className="flex items-center gap-[10px] mb-[20px] pb-[14px] border-b border-border">
        <h1 className="text-[1.2rem] font-semibold text-text-primary tracking-[-0.02em] flex-1">
          {dict.labels.supportTitle}
        </h1>
        <div className="flex items-center gap-[6px]">
          <span className="w-[8px] h-[8px] rounded-full bg-committed" />
          <span className="text-[12px] text-text-secondary">{dict.labels.supportOnline}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 flex flex-col gap-[10px] overflow-y-auto mb-[16px]" style={{ scrollbarWidth: 'thin' }}>
        {!isConfigured ? (
          <EmptyState message={dict.labels.noComments} />
        ) : isLoading ? (
          <LoadingSkeleton lines={3} height="56px" />
        ) : comments.length === 0 ? (
          <EmptyState message={dict.labels.noComments} />
        ) : (
          [...comments].reverse().map(comment => {
            const isClient = comment.author.email === myEmail || comment.isFromPortal;
            return (
              <MessageBubble
                key={comment.id}
                role={isClient ? 'client' : 'team'}
                content={comment.text}
                senderName={comment.author.name}
                timestamp={comment.created_at}
                clientBubbleStyle="light"
              />
            );
          })
        )}
      </div>

      {/* Input */}
      {isConfigured && supportTaskId && (
        <CommentInput
          taskId={supportTaskId}
          onSend={sendMessage}
          isSending={isSending}
        />
      )}
    </div>
  );
}
