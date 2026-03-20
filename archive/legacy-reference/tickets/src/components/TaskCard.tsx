import * as React from 'react';
import { Task } from '@/types';
import { statusConfig, priorityConfig } from '@/data/mockData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, ChevronRight, Loader2, MessageCircle, Paperclip, Timer, User } from 'lucide-react';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { formatTimeEstimate } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  unreadCount?: number;
  onClick?: () => void;
}

const TaskCard = React.forwardRef<HTMLDivElement, TaskCardProps>(
  ({ task, unreadCount = 0, onClick }, ref) => {
    const status = statusConfig[task.status];
    const priority = priorityConfig[task.priority];
    const timeEstimate = formatTimeEstimate(task.timeEstimate);
    
    const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate)) && task.status !== 'done';
    const isDueToday = task.dueDate && isToday(parseISO(task.dueDate));

    const isOptimistic = task._optimistic;

    return (
      <Card 
        ref={ref}
        className={`transition-all relative flex flex-col h-full ${isOptimistic ? 'opacity-75' : 'hover:shadow-md hover:border-primary/50 cursor-pointer'}`}
        onClick={isOptimistic ? undefined : onClick}
      >
        {/* Syncing overlay for optimistic tasks */}
        {isOptimistic && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Wird synchronisiert…
          </div>
        )}
        {/* Unread badge */}
        {!isOptimistic && unreadCount > 0 && (
          <div className="absolute -top-2 -right-2 h-5 min-w-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-medium flex items-center justify-center z-10">
            <MessageCircle className="h-3 w-3 mr-0.5" />
            {unreadCount > 9 ? '9+' : unreadCount}
          </div>
        )}
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg leading-tight flex-1">{task.title}</CardTitle>
            {!isOptimistic && <Badge variant={status.variant}>{status.label}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 flex-1 flex flex-col">
          <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
            {task.description}
          </p>
          
          <div className="flex items-center justify-between text-sm mt-auto">
            <div className="flex items-center gap-4">
              {task.dueDate && (
                <div className={`flex items-center gap-1 ${
                  isOverdue ? 'text-destructive' : isDueToday ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'
                }`}>
                  <CalendarDays className="h-4 w-4" />
                  <span>
                    {isOverdue ? 'Überfällig: ' : isDueToday ? 'Heute fällig: ' : ''}
                    {format(parseISO(task.dueDate), 'dd.MM.')}
                  </span>
                </div>
              )}
              {timeEstimate && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Timer className="h-4 w-4" />
                  <span>{timeEstimate}</span>
                </div>
              )}
              <span className={priority.className}>{priority.label}</span>
              <div className="flex items-center gap-1 text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span>{task.createdByName || 'Team'}</span>
              </div>
              {isOptimistic && task.pendingAttachments && task.pendingAttachments.length > 0 && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>{task.pendingAttachments.length} wird hochgeladen…</span>
                </div>
              )}
            </div>
            {!isOptimistic && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardContent>
      </Card>
    );
  }
);

TaskCard.displayName = 'TaskCard';

export default TaskCard;
