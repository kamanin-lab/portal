import { Bell } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '@/shared/hooks/useAuth';
import { dict } from '../lib/dictionary';

export function NotificationBell() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, isMarkingRead } = useNotifications(profile?.id);

  function handleNotificationClick(id: string, taskId: string | null) {
    markAsRead([id]);
    if (taskId) navigate(`/tickets/${taskId}`);
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="relative p-[6px] rounded-[var(--r-sm)] text-text-sidebar hover:bg-sidebar-hover hover:text-white transition-colors cursor-pointer"
          title={dict.labels.notifications}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-[2px] -right-[2px] min-w-[16px] h-[16px] px-[3px] rounded-full bg-cta text-white text-[9px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-xl)',
            width: '320px', maxHeight: '400px', overflowY: 'auto',
            zIndex: 100, padding: '8px 0',
          }}
        >
          <div className="flex items-center justify-between px-[14px] py-[8px] border-b border-border-light">
            <span className="text-[13px] font-semibold text-text-primary">{dict.labels.notifications}</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                disabled={isMarkingRead}
                className="text-[11.5px] text-accent hover:underline cursor-pointer"
              >
                {dict.labels.markAllRead}
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-[14px] py-[16px] text-[13px] text-text-tertiary text-center">
              {dict.labels.noNotifications}
            </div>
          ) : (
            notifications.slice(0, 15).map(n => (
              <DropdownMenu.Item
                key={n.id}
                onSelect={() => handleNotificationClick(n.id, n.task_id)}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  background: n.is_read ? 'transparent' : 'var(--accent-light)',
                  outline: 'none',
                }}
                className="hover:bg-surface-hover transition-colors"
              >
                <div className="text-[12.5px] font-medium text-text-primary">{n.title}</div>
                {n.message && (
                  <div className="text-[12px] text-text-secondary mt-[2px] truncate">{n.message}</div>
                )}
              </DropdownMenu.Item>
            ))
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
