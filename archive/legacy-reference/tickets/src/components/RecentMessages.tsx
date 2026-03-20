import { useState } from 'react';
import { CheckCheck, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

function extractSender(title: string, message: string): string {
  // "Nachricht von Yuri Kamanin" -> "Yuri"
  const vonMatch = title.match(/^Nachricht von (\w+)/i);
  if (vonMatch) return vonMatch[1];
  // "Message from Yuri Kamanin" -> "Yuri"
  const fromMatch = title.match(/^Message from (\w+)/i);
  if (fromMatch) return fromMatch[1];
  // "Yuri Kamanin replied" -> "Yuri"
  const repliedMatch = title.match(/^(\w+)\s+\w+\s+replied/i);
  if (repliedMatch) return repliedMatch[1];
  // Try extracting from message: "Yuri Kamanin replied:" or "Yuri replied:"
  const msgMatch = message.match(/^(\w+)(?:\s+\w+)?\s+(?:replied|hat geantwortet)/i);
  if (msgMatch) return msgMatch[1];
  return 'Team';
}

function formatNotificationMessage(message: string): string {
  // Remove patterns like "Yuri Kamanin replied:" or "Yuri replied:" or "Yuri hat geantwortet:"
  return message
    .replace(/^\w+(?:\s+\w+)?\s+replied:\s*/i, '')
    .replace(/^\w+(?:\s+\w+)?\s+hat geantwortet:\s*/i, '')
    .trim();
}

interface RecentMessagesProps {
  onOpenTask: (taskId: string) => void;
  onOpenSupport: () => void;
}

export default function RecentMessages({ onOpenTask, onOpenSupport }: RecentMessagesProps) {
  const { user, profile } = useAuth();
  const isMobile = useIsMobile();
  const [pageSize, setPageSize] = useState(10);
  const {
    notifications: allNotifications,
    markAsRead,
    markAllAsRead,
    isLoading,
  } = useNotifications(user?.id);

  const supportTaskId = profile?.support_task_id;
  const notifications = allNotifications.filter(n => n.task_id !== supportTaskId);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleRowClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead([notification.id]);
    }

    if (notification.task_id) {
      onOpenTask(notification.task_id);
    }
  };

  if (isLoading) return null;

  const visibleNotifications = notifications.slice(0, pageSize);

  const paginationFooter = (
    <div className="flex items-center justify-end gap-2 pt-2 text-sm text-muted-foreground">
      <span>Anzeigen:</span>
      <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
        <SelectTrigger className="h-8 w-[70px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="10">10</SelectItem>
          <SelectItem value="20">20</SelectItem>
          <SelectItem value="50">50</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Letzte Updates
          {unreadCount > 0 && (
            <span className="rounded-full bg-destructive text-destructive-foreground text-xs font-medium px-2 py-0.5">
              {unreadCount}
            </span>
          )}
        </h2>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => markAllAsRead()}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Alle gelesen
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          Noch keine Nachrichten
        </div>
      ) : isMobile ? (
        // Mobile: card view
        <div className="space-y-2">
          {visibleNotifications.map((notification) => (
            <div
              key={notification.id}
              className={cn(
                'rounded-md border p-3 cursor-pointer transition-colors hover:bg-muted/50',
                !notification.is_read && 'bg-primary/5 border-primary/20'
              )}
              onClick={() => handleRowClick(notification)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn('text-sm', !notification.is_read && 'font-semibold')}>
                  {extractSender(notification.title, notification.message)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(notification.created_at), {
                    addSuffix: true,
                    locale: de,
                  })}
                </span>
              </div>
              <p className={cn('text-sm', !notification.is_read && 'text-primary font-medium')}>
                {notification.title}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {formatNotificationMessage(notification.message)}
              </p>
            </div>
          ))}
          {paginationFooter}
        </div>
      ) : (
        // Desktop: table view
        <div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Datum</TableHead>
                  <TableHead className="w-[120px]">Absender</TableHead>
                  <TableHead>Betreff & Nachricht</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleNotifications.map((notification) => (
                  <TableRow
                    key={notification.id}
                    className={cn(
                      'cursor-pointer',
                      !notification.is_read && 'bg-primary/5 font-medium'
                    )}
                    onClick={() => handleRowClick(notification)}
                  >
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(notification.created_at), {
                        addSuffix: true,
                        locale: de,
                      })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {extractSender(notification.title, notification.message)}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className={cn('text-sm', !notification.is_read && 'text-primary')}>
                          {notification.title}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {formatNotificationMessage(notification.message)}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {paginationFooter}
        </div>
      )}
    </div>
  );
}
