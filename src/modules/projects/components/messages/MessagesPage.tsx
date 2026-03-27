import type { Project } from '../../types/project';
import { MessageBubble } from '@/shared/components/common/MessageBubble';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';

interface MessagesPageProps {
  project: Project;
}

export function MessagesPage({ project }: MessagesPageProps) {
  // Collect all messages grouped by step
  const groups = project.chapters.flatMap(ch =>
    ch.steps
      .filter(s => s.messages.length > 0)
      .map(s => ({
        stepId: s.id,
        stepTitle: s.title,
        chapterTitle: ch.title,
        messages: s.messages,
      }))
  );

  return (
    <ContentContainer width="narrow">
    <div className="p-6 max-[768px]:p-4">
      <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-5">
        Nachrichten
      </h1>

      {groups.length === 0 && <EmptyState message="Noch keine Nachrichten." />}

      {groups.map(group => (
        <div key={group.stepId} className="mb-7">
          <div className="text-xxs font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] mb-3 pb-2 border-b border-[var(--border-light)]">
            {group.chapterTitle} · {group.stepTitle}
          </div>
          <div className="flex flex-col gap-3.5 px-1">
            {group.messages.map((msg, idx) => (
              <MessageBubble
                key={idx}
                role={msg.role}
                content={msg.text}
                senderName={msg.author}
                timeLabel={msg.time}
                clientBubbleStyle="solid"
                showAvatar
              />
            ))}
          </div>
        </div>
      ))}
    </div>
    </ContentContainer>
  );
}
