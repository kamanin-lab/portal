import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Task, TaskStatus, TaskPriority } from '@/types';
import { cn } from '@/lib/utils';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import TaskCard from '@/components/TaskCard';
import TaskDetailSheet from '@/components/TaskDetailSheet';
import StatusFilter from '@/components/StatusFilter';
import TaskSearchInput from '@/components/TaskSearchInput';
import CreateTaskDialog from '@/components/CreateTaskDialog';
import { SupportChatSheet } from '@/components/SupportChatSheet';
import TaskFiltersDropdown, { DueDateFilter } from '@/components/TaskFiltersDropdown';
import RecentMessages from '@/components/RecentMessages';
import { RefreshCw, Clock, AlertCircle, Settings, Plus, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { startOfDay, endOfDay, addDays, addMonths, isBefore, isAfter, isEqual } from 'date-fns';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { useClickUpTasks, ClickUpTask } from '@/hooks/useClickUpTasks';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Map ClickUp status to our internal portal status
function mapClickUpStatus(status: string): TaskStatus {
  const statusLower = status.toLowerCase();
  
  if (statusLower.includes('done') || statusLower.includes('complete') || statusLower.includes('closed')) {
    return 'done';
  }
  if (statusLower.includes('cancel')) {
    return 'cancelled';
  }
  if (statusLower.includes('approved')) {
    return 'approved';
  }
  if (statusLower === 'client review' || statusLower === 'client_review') {
    return 'needs_attention';
  }
  if (statusLower.includes('hold') || statusLower.includes('on hold') || statusLower === 'on_hold') {
    return 'on_hold';
  }
  if (statusLower.includes('progress') || statusLower.includes('doing') || statusLower.includes('working') 
      || statusLower.includes('review') || statusLower.includes('rework') || statusLower.includes('revision') || statusLower.includes('changes')) {
    return 'in_progress';
  }
  return 'open';
}

// Map ClickUp priority to our internal priority
function mapClickUpPriority(priority: string | null): TaskPriority {
  if (!priority) return 'normal';
  const priorityLower = priority.toLowerCase();
  if (priorityLower === 'urgent') return 'urgent';
  if (priorityLower === 'high') return 'high';
  if (priorityLower === 'low') return 'low';
  return 'normal';
}

// Transform ClickUp task to our Task type
function transformClickUpTask(clickupTask: ClickUpTask): Task {
  const isOptimistic = '_optimistic' in clickupTask && (clickupTask as any)._optimistic === true;
  return {
    id: clickupTask.id,
    title: clickupTask.name,
    description: clickupTask.description || 'Keine Beschreibung vorhanden',
    status: mapClickUpStatus(clickupTask.status),
    priority: mapClickUpPriority(clickupTask.priority),
    dueDate: clickupTask.due_date ? clickupTask.due_date.split('T')[0] : null,
    timeEstimate: clickupTask.time_estimate || null,
    clickupUrl: clickupTask.url,
    listId: clickupTask.list_id,
    listName: clickupTask.list_name,
    lastSynced: new Date().toISOString(),
    createdAt: clickupTask.created_at,
    lastActivityAt: clickupTask.last_activity_at,
    createdByName: clickupTask.created_by_name || null,
    createdByUserId: clickupTask.created_by_user_id || null,
    ...(isOptimistic ? {
      _optimistic: true,
      pendingAttachments: (clickupTask as any).pending_attachments,
    } : {}),
  };
}

const Dashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus | 'all' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSupportChatOpen, setIsSupportChatOpen] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilter>('all');
  const { profile, user, isLoading: isAuthLoading } = useAuth();
  const { data: clickupTasks, isLoading, status: taskStatus, error, isFetching, forceRefresh } = useClickUpTasks();
  const { supportUnread, taskUnread, markAsRead } = useUnreadCounts(user?.id);
  
  const userName = profile?.full_name || user?.email?.split('@')[0] || 'Benutzer';
  const userCompany = profile?.company_name || 'Ihr Unternehmen';
  
  const hasListIds = Array.isArray(profile?.clickup_list_ids) 
    && profile.clickup_list_ids.filter(Boolean).length > 0;
  
  const isInitializing = isAuthLoading || taskStatus === 'pending' || selectedStatus === null;

  useEffect(() => {
    if (searchParams.get('openSupport') === 'true') {
      setIsSupportChatOpen(true);
      markAsRead('support');
      searchParams.delete('openSupport');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, markAsRead]);

  useEffect(() => {
    if (searchParams.get('createTask') === 'true') {
      setIsCreateDialogOpen(true);
      searchParams.delete('createTask');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const tasks: Task[] = useMemo(() => {
    if (!clickupTasks) return [];
    return clickupTasks.map(transformClickUpTask);
  }, [clickupTasks]);

  useEffect(() => {
    if (selectedStatus === null && tasks.length >= 0 && taskStatus === 'success') {
      const hasNeedsAttention = tasks.some(t => t.status === 'needs_attention');
      setSelectedStatus(hasNeedsAttention ? 'needs_attention' : 'open');
    }
  }, [tasks, selectedStatus, taskStatus]);

  useEffect(() => {
    const openTaskId = searchParams.get('openTask');
    if (openTaskId && !isLoading) {
      const taskToOpen = tasks.find(t => t.id === openTaskId);
      if (taskToOpen) {
        setSelectedTask(taskToOpen);
        setIsSheetOpen(true);
        markAsRead(`task:${openTaskId}`);
      } else {
        setSelectedTask({
          id: openTaskId,
          title: 'Wird geladen...',
          description: '',
          status: 'open',
          priority: 'normal',
          dueDate: null,
          timeEstimate: null,
          clickupUrl: null,
          listId: null,
          listName: null,
          lastSynced: null,
          createdAt: null,
        });
        setIsSheetOpen(true);
        markAsRead(`task:${openTaskId}`);
      }
      searchParams.delete('openTask');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, tasks, isLoading, markAsRead]);
  
  const lastSyncTime = tasks.length > 0 
    ? format(new Date(), 'd. MMM, HH:mm', { locale: de })
    : 'Nie';

  const filteredTasks = useMemo(() => {
    let result = tasks;
    
    if (selectedStatus !== 'all') {
      result = result.filter((task) => task.status === selectedStatus);
    }
    
    if (priorityFilter !== 'all') {
      result = result.filter((task) => task.priority === priorityFilter);
    }
    
    if (dueDateFilter !== 'all') {
      const today = startOfDay(new Date());
      const weekEnd = endOfDay(addDays(today, 7));
      const monthEnd = endOfDay(addMonths(today, 1));
      
      result = result.filter((task) => {
        if (dueDateFilter === 'no_date') return !task.dueDate;
        if (!task.dueDate) return false;
        
        const dueDate = startOfDay(new Date(task.dueDate));
        
        switch (dueDateFilter) {
          case 'overdue': 
            return isBefore(dueDate, today);
          case 'today': 
            return isEqual(dueDate, today);
          case 'this_week': 
            return (isEqual(dueDate, today) || isAfter(dueDate, today)) && isBefore(dueDate, weekEnd);
          case 'this_month': 
            return (isEqual(dueDate, today) || isAfter(dueDate, today)) && isBefore(dueDate, monthEnd);
          default: 
            return true;
        }
      });
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((task) => 
        task.title.toLowerCase().includes(query) ||
        task.description.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [tasks, selectedStatus, searchQuery, priorityFilter, dueDateFilter]);

  const needsAttention = tasks.filter(
    (t) => t.status === 'needs_attention'
  ).length;

  const handleRefresh = async () => {
    await forceRefresh();
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setIsSheetOpen(true);
  };

  const handleSupportOpen = () => {
    setIsSupportChatOpen(true);
    markAsRead('support');
  };

  const handleSheetClose = (open: boolean) => {
    setIsSheetOpen(open);
    if (!open && selectedTask) {
      markAsRead(`task:${selectedTask.id}`);
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8 space-y-8">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-96" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="container py-6 space-y-5 flex-1">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Fehler beim Laden der Aufgaben</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Aufgaben konnten nicht geladen werden.'}
            </AlertDescription>
          </Alert>
        )}

        {!isInitializing && !!profile && !hasListIds && !error && (
          <Alert>
            <Settings className="h-4 w-4" />
            <AlertTitle>Workspace nicht konfiguriert</AlertTitle>
            <AlertDescription>
              Die Einrichtung Ihres Workspace ist noch nicht abgeschlossen. Bitte kontaktieren Sie den Support.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between gap-4">
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            disabled={!hasListIds}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Neue Aufgabe
          </Button>
          
          <Button
            onClick={handleSupportOpen}
            className="bg-primary text-primary-foreground hover:bg-primary/90 relative"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Support
            {supportUnread > 0 && (
              <span className="absolute -top-2 -right-2 h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-xs font-medium flex items-center justify-center">
                {supportUnread > 9 ? '9+' : supportUnread}
              </span>
            )}
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {needsAttention > 0 && (
              <button
                onClick={() => setSelectedStatus('needs_attention')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  selectedStatus === 'needs_attention'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                )}
              >
              <AlertCircle className="h-4 w-4" />
              <span>Ihre Rückmeldung</span>
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-xs',
                selectedStatus === 'needs_attention' ? 'bg-primary-foreground/20' : 'bg-background'
              )}>
                {needsAttention}
              </span>
              </button>
            )}
            <StatusFilter
              tasks={tasks}
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
            />
          </div>
          <TaskSearchInput value={searchQuery} onChange={setSearchQuery} />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isFetching}
              className="flex items-center gap-1 hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
            <Clock className="h-3 w-3" />
            <span>Synchronisiert: {lastSyncTime}</span>
          </div>
          <TaskFiltersDropdown
            priorityFilter={priorityFilter}
            dueDateFilter={dueDateFilter}
            onPriorityChange={setPriorityFilter}
            onDueDateChange={setDueDateFilter}
          />
        </div>

        {filteredTasks.length > 0 ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(showAllTasks ? filteredTasks : filteredTasks.slice(0, 6)).map((task) => (
                <TaskCard 
                  key={task.id} 
                  task={task}
                  unreadCount={taskUnread[task.id] || 0}
                  onClick={() => handleTaskClick(task)}
                />
              ))}
            </div>
            {filteredTasks.length > 6 && (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllTasks(!showAllTasks)}
                  className="text-muted-foreground"
                >
                  {showAllTasks ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-1" />
                      Weniger anzeigen
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-1" />
                      Alle anzeigen ({filteredTasks.length})
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {hasListIds 
                ? searchQuery.trim() 
                  ? 'Keine Aufgaben gefunden, die Ihrer Suche entsprechen.' 
                  : 'Keine Aufgaben mit diesem Status gefunden.'
                : 'Die Einrichtung Ihres Workspace ist noch nicht abgeschlossen. Bitte kontaktieren Sie den Support.'}
            </p>
          </div>
        )}

        <RecentMessages
          onOpenTask={(taskId) => {
            const task = tasks.find(t => t.id === taskId);
            if (task) {
              handleTaskClick(task);
            } else {
              setSelectedTask({
                id: taskId,
                title: 'Wird geladen...',
                description: '',
                status: 'open',
                priority: 'normal',
                dueDate: null,
                timeEstimate: null,
                clickupUrl: null,
                listId: null,
                listName: null,
                lastSynced: null,
                createdAt: null,
              });
              setIsSheetOpen(true);
            }
          }}
          onOpenSupport={handleSupportOpen}
        />
      </main>

      <Footer />

      <TaskDetailSheet
        task={selectedTask}
        open={isSheetOpen}
        onOpenChange={handleSheetClose}
      />

      <CreateTaskDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />

      <SupportChatSheet
        open={isSupportChatOpen}
        onOpenChange={setIsSupportChatOpen}
      />
    </div>
  );
};

export default Dashboard;
