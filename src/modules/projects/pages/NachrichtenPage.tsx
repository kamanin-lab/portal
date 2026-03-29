import { useProject } from '../hooks/useProject';
import { useProjectComments } from '../hooks/useProjectComments';
import { MessagesPage } from '../components/messages/MessagesPage';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { EmptyState } from '@/shared/components/common/EmptyState';

export function NachrichtenPage() {
  const { project, isLoading } = useProject();
  const { data: comments = [], isLoading: commentsLoading } = useProjectComments(project ?? null);

  if (isLoading) {
    return (
      <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
        <LoadingSkeleton lines={6} height="56px" />
      </ContentContainer>
    );
  }

  if (!project) {
    return (
      <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
        <EmptyState message="Nachrichten konnten nicht geladen werden." />
      </ContentContainer>
    );
  }

  return <MessagesPage comments={comments} isLoading={commentsLoading} />;
}
