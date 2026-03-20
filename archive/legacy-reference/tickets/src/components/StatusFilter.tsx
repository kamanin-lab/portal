import { useState, useMemo } from 'react';
import { Task, TaskStatus } from '@/types';
import { statusConfig } from '@/data/mockData';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

interface StatusFilterProps {
  tasks: Task[];
  selectedStatus: TaskStatus | 'all';
  onStatusChange: (status: TaskStatus | 'all') => void;
}

const StatusFilter = ({ tasks, selectedStatus, onStatusChange }: StatusFilterProps) => {
  const statusCounts = tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {} as Record<TaskStatus, number>);

  // Main visible statuses per spec order
  const mainStatuses: (TaskStatus | 'all')[] = ['open', 'in_progress', 'approved', 'done', 'all'];
  
  // "More" dropdown statuses
  const moreStatuses: TaskStatus[] = ['on_hold', 'cancelled'];
  
  // Check if a "more" status is currently active
  const isMoreActive = moreStatuses.includes(selectedStatus as TaskStatus);
  const moreLabel = isMoreActive ? statusConfig[selectedStatus as TaskStatus]?.label : 'Mehr';

  return (
    <div className="flex flex-wrap gap-2">
      {mainStatuses.map((status) => {
        const count = status === 'all' ? tasks.length : statusCounts[status] || 0;
        const config = status === 'all' ? { label: 'Alle' } : statusConfig[status];
        const isActive = selectedStatus === status;

        return (
          <button
            key={status}
            onClick={() => onStatusChange(status)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            )}
          >
            {config.label}
            <span className={cn(
              'rounded-full px-1.5 py-0.5 text-xs',
              isActive ? 'bg-primary-foreground/20' : 'bg-background'
            )}>
              {count}
            </span>
          </button>
        );
      })}
      
      {/* More dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              isMoreActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            )}
          >
            {moreLabel}
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {moreStatuses.map((status) => {
            const count = statusCounts[status] || 0;
            const config = statusConfig[status];
            return (
              <DropdownMenuItem
                key={status}
                onClick={() => onStatusChange(status)}
                className={cn(
                  'flex items-center justify-between gap-4',
                  selectedStatus === status && 'bg-accent'
                )}
              >
                <span>{config.label}</span>
                <span className="text-xs text-muted-foreground">{count}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default StatusFilter;
