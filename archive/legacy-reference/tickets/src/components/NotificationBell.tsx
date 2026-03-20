import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// Extract first name only from messages like "Yuri Kamanin replied: text" -> "Yuri replied: text"
function formatNotificationMessage(message: string): string {
  const replyMatch = message.match(/^(\w+)\s+[\w\s]+\s+replied:/i);
  if (replyMatch) {
    return message.replace(/^(\w+)\s+[\w\s]+\s+replied:/i, '$1 replied:');
  }
  return message;
}

function NotificationItem({ 
  notification, 
  onMarkRead,
  onNavigate,
}: { 
  notification: Notification;
  onMarkRead: (id: string) => void;
  onNavigate: (notification: Notification) => void;
}) {
  const handleClick = () => {
    if (!notification.is_read) {
      onMarkRead(notification.id);
    }
    onNavigate(notification);
  };

  return (
    <DropdownMenuItem 
      className={cn(
        "flex flex-col items-start gap-1 p-3 cursor-pointer",
        !notification.is_read && "bg-primary/5"
      )}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between w-full gap-2">
        <span className={cn(
          "text-sm font-medium",
          !notification.is_read && "text-primary"
        )}>
          {notification.title}
        </span>
        {!notification.is_read && (
          <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1" />
        )}
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">
        {formatNotificationMessage(notification.message)}
      </p>
      <span className="text-xs text-muted-foreground/70">
        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: de })}
      </span>
    </DropdownMenuItem>
  );
}

export default function NotificationBell() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { 
    notifications: allNotifications, 
    markAsRead, 
    markAllAsRead,
    isLoading,
  } = useNotifications(user?.id);

  const supportTaskId = profile?.support_task_id;
  const notifications = allNotifications.filter(n => n.task_id !== supportTaskId);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleMarkRead = (id: string) => {
    markAsRead([id]);
  };

  const handleNavigate = (notification: Notification) => {
    const isSupportNotification = notification.title.startsWith('Nachricht von ') || notification.title.startsWith('Message from ');
    
    if (isSupportNotification) {
      navigate('/dashboard?openSupport=true');
    } else if (notification.task_id) {
      navigate(`/dashboard?openTask=${notification.task_id}`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs font-medium flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end" forceMount>
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Benachrichtigungen</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-1 px-2 text-xs"
              onClick={(e) => {
                e.preventDefault();
                markAllAsRead();
              }}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Alle gelesen
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Wird geladen...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Noch keine Benachrichtigungen
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            {notifications.slice(0, 20).map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={handleMarkRead}
                onNavigate={handleNavigate}
              />
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
