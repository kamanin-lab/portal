import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { TaskPriority } from '@/types';
import { cn } from '@/lib/utils';

export type DueDateFilter = 'all' | 'overdue' | 'today' | 'this_week' | 'this_month' | 'no_date';

interface TaskFiltersDropdownProps {
  priorityFilter: TaskPriority | 'all';
  dueDateFilter: DueDateFilter;
  onPriorityChange: (priority: TaskPriority | 'all') => void;
  onDueDateChange: (dueDate: DueDateFilter) => void;
}

const priorityOptions: { value: TaskPriority | 'all'; label: string }[] = [
  { value: 'all', label: 'Alle Prioritäten' },
  { value: 'urgent', label: 'Dringend' },
  { value: 'high', label: 'Hoch' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Niedrig' },
];

const dueDateOptions: { value: DueDateFilter; label: string }[] = [
  { value: 'all', label: 'Alle Termine' },
  { value: 'overdue', label: 'Überfällig' },
  { value: 'today', label: 'Heute fällig' },
  { value: 'this_week', label: 'Diese Woche' },
  { value: 'this_month', label: 'Diesen Monat' },
  { value: 'no_date', label: 'Ohne Termin' },
];

const TaskFiltersDropdown = ({
  priorityFilter,
  dueDateFilter,
  onPriorityChange,
  onDueDateChange,
}: TaskFiltersDropdownProps) => {
  const activeFilterCount = 
    (priorityFilter !== 'all' ? 1 : 0) + 
    (dueDateFilter !== 'all' ? 1 : 0);

  const handleClearAll = () => {
    onPriorityChange('all');
    onDueDateChange('all');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <SlidersHorizontal className="h-3 w-3" />
          <span>Filter</span>
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-0 bg-popover border border-border shadow-lg">
        <div className="p-3 space-y-4">
          {/* Priority Section */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Priorität
            </h4>
            <div className="space-y-1">
              {priorityOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onPriorityChange(option.value)}
                  className={cn(
                    'w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors',
                    priorityFilter === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-secondary text-foreground'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due Date Section */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Fälligkeitsdatum
            </h4>
            <div className="space-y-1">
              {dueDateOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onDueDateChange(option.value)}
                  className={cn(
                    'w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors',
                    dueDateFilter === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-secondary text-foreground'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clear All Button */}
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="w-full text-muted-foreground hover:text-foreground"
            >
              Alle Filter zurücksetzen
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TaskFiltersDropdown;
