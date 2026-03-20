import { useProject } from '../hooks/useProject';
import { MessagesPage } from '../components/messages/MessagesPage';

export function NachrichtenPage() {
  const { project, isLoading } = useProject();
  if (isLoading || !project) return null;
  return <MessagesPage project={project} />;
}
