import { SupportChat } from '../components/SupportChat';
import { useUnreadCounts } from '../hooks/useUnreadCounts';
import { useAuth } from '@/shared/hooks/useAuth';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';

export function SupportPage() {
  const { user } = useAuth();
  const { markAsRead } = useUnreadCounts(user?.id);

  return (
    <div className="h-[calc(100vh-52px)] md:h-screen flex flex-col">
      <ContentContainer width="narrow" className="flex-1 flex flex-col min-h-0">
        <SupportChat active onRead={() => markAsRead('support')} />
      </ContentContainer>
    </div>
  );
}
