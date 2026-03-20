import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Task, TaskStatus, TaskPriority } from '@/types';
import { statusConfig, priorityConfig } from '@/data/mockData';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowLeft, CalendarDays, Clock, AlertCircle, MessageSquare, CheckCircle2, RotateCcw, Loader2, ChevronLeft, ChevronRight, Timer, Pause, Play, XCircle } from 'lucide-react';
import { formatTimeEstimate } from '@/lib/utils';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { useSingleTask } from '@/hooks/useSingleTask';
import { useTaskComments, usePostComment } from '@/hooks/useTaskComments';
import { useTaskActions } from '@/hooks/useTaskActions';
import { ClickUpTask } from '@/hooks/useClickUpTasks';
import { CommentInput, FileData } from '@/components/CommentInput';
import { CommentAttachments } from '@/components/CommentAttachments';
import { LinkifiedText } from '@/components/LinkifiedText';

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
    createdByName: clickupTask.created_by_name || null,
    createdByUserId: clickupTask.created_by_user_id || null,
  };
}
const PAGE_OPTIONS = [25, 50, 100];
const TaskDetail = () => {
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const {
    fetchSingleTask
  } = useSingleTask();
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [commentsPerPage, setCommentsPerPage] = useState(25);
  const {
    data: comments,
    isLoading: commentsLoading
  } = useTaskComments(task ? task.id : null);
  const {
    approveTask,
    requestChanges,
    putOnHold,
    resumeTask,
    cancelTask,
    isLoading: actionLoading
  } = useTaskActions();
  const {
    mutateAsync: postComment,
    isPending: isPostingComment
  } = usePostComment();
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showChangesDialog, setShowChangesDialog] = useState(false);
  const [showHoldDialog, setShowHoldDialog] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState('');

  // Calculate pagination
  const totalComments = comments?.length || 0;
  const totalPages = Math.ceil(totalComments / commentsPerPage);
  const startIndex = (currentPage - 1) * commentsPerPage;
  const endIndex = startIndex + commentsPerPage;
  const paginatedComments = comments?.slice(startIndex, endIndex) || [];

  // Reset to page 1 when per-page count changes
  useEffect(() => {
    setCurrentPage(1);
  }, [commentsPerPage]);

  // Fetch task on mount
  useEffect(() => {
    if (!id) {
      setError('Keine Aufgaben-ID angegeben');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    fetchSingleTask(id).then(clickupTask => {
      if (clickupTask) {
        setTask(transformClickUpTask(clickupTask));
      } else {
        setError('Aufgabe nicht gefunden oder kein Zugriff möglich');
      }
    }).catch(err => {
      console.error('Error fetching task:', err);
      setError('Aufgabe konnte nicht geladen werden');
    }).finally(() => {
      setIsLoading(false);
    });
  }, [id, fetchSingleTask]);
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };
  const handleApprove = async () => {
    if (!task) return;
    try {
      await approveTask(task.id, feedbackComment || undefined);
      setShowApproveDialog(false);
      setFeedbackComment('');
      // Refresh task data
      const updatedTask = await fetchSingleTask(task.id);
      if (updatedTask) setTask(transformClickUpTask(updatedTask));
    } catch {
      // Error handled by the hook
    }
  };
  const handleRequestChanges = async () => {
    if (!task) return;
    try {
      await requestChanges(task.id, feedbackComment || undefined);
      setShowChangesDialog(false);
      setFeedbackComment('');
      // Refresh task data
      const updatedTask = await fetchSingleTask(task.id);
      if (updatedTask) setTask(transformClickUpTask(updatedTask));
    } catch {
      // Error handled by the hook
    }
  };
  const handlePutOnHold = async () => {
    if (!task) return;
    try {
      await putOnHold(task.id, feedbackComment || undefined);
      setShowHoldDialog(false);
      setFeedbackComment('');
      const updatedTask = await fetchSingleTask(task.id);
      if (updatedTask) setTask(transformClickUpTask(updatedTask));
    } catch {}
  };
  const handleResume = async () => {
    if (!task) return;
    try {
      await resumeTask(task.id, feedbackComment || undefined);
      setShowResumeDialog(false);
      setFeedbackComment('');
      const updatedTask = await fetchSingleTask(task.id);
      if (updatedTask) setTask(transformClickUpTask(updatedTask));
    } catch {}
  };
  const handleCancel = async () => {
    if (!task) return;
    try {
      await cancelTask(task.id, feedbackComment || undefined);
      setShowCancelDialog(false);
      setFeedbackComment('');
      const updatedTask = await fetchSingleTask(task.id);
      if (updatedTask) setTask(transformClickUpTask(updatedTask));
    } catch {}
  };
  const handlePostComment = async (comment: string, files: FileData[]) => {
    if (!task) return;
    await postComment({
      taskId: task.id,
      comment,
      files
    });
  };

  // Loading state
  if (isLoading) {
    return <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="container py-8 flex-1">
          <Skeleton className="h-9 w-32 mb-6" />
          <div className="space-y-4 mb-8">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-32 w-full" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-48 w-full" />
                </CardContent>
              </Card>
            </div>
            <div>
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-20" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
        <Footer />
      </div>;
  }

  // Error state
  if (error || !task) {
    return <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="container py-8 flex-1">
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Aufgabe nicht gefunden</h2>
            <p className="text-muted-foreground mb-4">
              {error || 'Diese Aufgabe wurde möglicherweise gelöscht oder Sie haben keinen Zugriff darauf.'}
            </p>
            <Button onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück zum Dashboard
            </Button>
          </div>
        </main>
        <Footer />
      </div>;
  }
  const status = statusConfig[task.status];
  const priority = priorityConfig[task.priority];
  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate)) && task.status !== 'done';
  const isDueToday = task.dueDate && isToday(parseISO(task.dueDate));
  const canTakeAction = task.status === 'needs_attention';
  const canHoldOrCancel = task.status !== 'done' && task.status !== 'cancelled';
  return <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="container py-8 flex-1">
        {/* Back Button */}
        <Button variant="ghost-outline" size="sm" className="mb-6" onClick={() => navigate('/dashboard')}>
           <ArrowLeft className="mr-2 h-4 w-4" />
           Zurück zum Dashboard
         </Button>

        {/* Task Header */}
        <div className="space-y-4 mb-8">
          <div className="flex items-start gap-2 flex-wrap">
            <Badge variant={status.variant}>
              {status.label}
            </Badge>
            <Badge variant="outline" className={priority.className}>
              {priority.label}
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{task.title}</h1>
          
        </div>

        {/* Due Date & Timeline - Full width above grid */}
        <div className="flex flex-wrap gap-4 mb-6">
          {task.dueDate && <div className={`flex items-center gap-2 text-sm ${isOverdue ? 'text-destructive' : isDueToday ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}`}>
              <CalendarDays className="h-4 w-4" />
              <div>
                <span className="font-medium">Fällig:</span>{' '}
                {isOverdue && <span className="inline-flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Überfällig –
                  </span>}
                {isDueToday && 'Heute – '}
                {format(parseISO(task.dueDate), 'dd.MM.yyyy')}
              </div>
            </div>}
          
          {task.createdAt && <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Erstellt von {task.createdByName || 'Team'} am {format(parseISO(task.createdAt), 'dd.MM.yyyy')}</span>
            </div>}
          
          {task.timeEstimate && <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Timer className="h-4 w-4" />
              <span>Geschätzte Zeit: {formatTimeEstimate(task.timeEstimate)}</span>
            </div>}
        </div>

        <div className="grid gap-6 lg:grid-cols-3 items-start">
          {/* Left column: Description + Comments stacked */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Beschreibung</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed ${!isDescriptionExpanded ? 'line-clamp-6' : ''}`}>
                  {task.description || 'Keine Beschreibung vorhanden.'}
                </div>
                {task.description && task.description.length > 300 && <Button variant="link" size="sm" onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)} className="px-0 h-auto mt-2 text-primary">
                    {isDescriptionExpanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
                  </Button>}
              </CardContent>
            </Card>

            {/* Comments Section - Now inside the left column */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Kommentare
                  {totalComments > 0 && <Badge variant="secondary" className="text-xs">
                      {totalComments}
                    </Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Comment Input - Now at the top */}
                <CommentInput onSubmit={handlePostComment} isSubmitting={isPostingComment} placeholder="Kommentar schreiben..." maxLength={10000} />

                {/* Pagination Controls */}
                {totalComments > 0 && <div className="flex items-center justify-between gap-4 py-3 border-y">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Anzeigen:</span>
                      <Select value={String(commentsPerPage)} onValueChange={v => setCommentsPerPage(Number(v))}>
                        <SelectTrigger className="w-20 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAGE_OPTIONS.map(opt => <SelectItem key={opt} value={String(opt)}>{opt}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {totalPages > 1 && <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="h-8 w-8 p-0">
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          {currentPage} von {totalPages}
                        </span>
                        <Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="h-8 w-8 p-0">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>}
                  </div>}

                {commentsLoading ? <div className="space-y-4">
                    {[...Array(3)].map((_, i) => <div key={i} className="flex gap-3">
                        <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-16 w-full" />
                        </div>
                      </div>)}
                  </div> : paginatedComments.length > 0 ? <div className="space-y-4">
                    {paginatedComments.map(comment => <div key={comment.id} className="flex gap-3">
                        <Avatar className="h-10 w-10 shrink-0">
                          {comment.author.avatar && <AvatarImage src={comment.author.avatar} alt={comment.author.name} />}
                          <AvatarFallback>
                            {getInitials(comment.author.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium truncate">
                              {comment.author.name}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {format(parseISO(comment.created_at), 'dd.MM.yyyy, HH:mm')}
                            </span>
                          </div>
                          <div className="text-sm text-foreground bg-muted/50 rounded-lg p-3 whitespace-pre-wrap break-words">
                            <LinkifiedText text={comment.text} />
                          </div>
                          {/* Attachments */}
                          {comment.attachments && comment.attachments.length > 0 && <CommentAttachments attachments={comment.attachments} isFromPortal={comment.isFromPortal} className="mt-2" />}
                        </div>
                      </div>)}
                  </div> : <p className="text-sm text-muted-foreground italic py-4">
                    Noch keine Kommentare. Schreiben Sie den ersten Kommentar!
                  </p>}
              </CardContent>
            </Card>
          </div>

          {/* Actions Sidebar - Same level as Description */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Aktionen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {canTakeAction && <>
                    <div className="flex flex-col gap-2">
                      <Button onClick={() => setShowApproveDialog(true)} className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={actionLoading}>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Freigeben
                      </Button>
                      <Button onClick={() => setShowChangesDialog(true)} variant="outline" className="w-full" disabled={actionLoading}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Änderungen anfordern
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground bg-primary/10 rounded-lg p-3">
                      💡 Diese Aufgabe wartet auf Ihre Rückmeldung.
                    </p>
                  </>}
                
                {task.status === 'on_hold' && <p className="text-xs text-muted-foreground bg-orange-500/10 rounded-lg p-3">
                    ⏸️ Diese Aufgabe ist derzeit pausiert.
                  </p>}

                {task.status === 'approved' && <p className="text-xs text-muted-foreground bg-emerald-500/10 rounded-lg p-3">
                    ✅ Sie haben diese Aufgabe freigegeben.
                  </p>}

                {/* Secondary actions - Hold / Resume / Cancel */}
                {canHoldOrCancel && (
                  <div className="flex gap-2 pt-1">
                    {task.status === 'on_hold' ? (
                      <Button variant="ghost" size="sm" onClick={() => setShowResumeDialog(true)} disabled={actionLoading} className="text-xs">
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Fortsetzen
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setShowHoldDialog(true)} disabled={actionLoading} className="text-xs">
                        <Pause className="h-3.5 w-3.5 mr-1" />
                        Pausieren
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setShowCancelDialog(true)} disabled={actionLoading} className="text-xs text-destructive hover:text-destructive">
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Abbrechen
                    </Button>
                  </div>
                )}

                {!canTakeAction && !canHoldOrCancel && <p className="text-sm text-muted-foreground">
                    Für diesen Status sind keine Aktionen verfügbar.
                  </p>}
              </CardContent>
            </Card>

            {/* Sync Info */}
            <div className="text-xs text-muted-foreground">
              Zuletzt synchronisiert: {task.lastSynced ? format(parseISO(task.lastSynced), 'dd.MM.yyyy, HH:mm') : 'Unbekannt'}
            </div>
          </div>

        </div>
      </main>

      {/* Approve Dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aufgabe freigeben?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Aufgabe wird als freigegeben markiert. Das Team wird benachrichtigt und kann mit der Umsetzung fortfahren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea placeholder="Optionaler Kommentar (z. B. 'Sieht gut aus!' oder konkretes Feedback)" value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)} className="min-h-[80px]" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={actionLoading}>
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Freigeben
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Request Changes Dialog */}
      <AlertDialog open={showChangesDialog} onOpenChange={setShowChangesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Änderungen anfordern?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Aufgabe wird zur Überarbeitung zurückgegeben. Bitte beschreiben Sie die gewünschten Änderungen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea placeholder="Beschreiben Sie die gewünschten Änderungen (erforderlich)" value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)} className="min-h-[100px]" required />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleRequestChanges} disabled={actionLoading || !feedbackComment.trim()} className="bg-orange-600 hover:bg-orange-700">
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Änderungen anfordern
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hold Dialog */}
      <AlertDialog open={showHoldDialog} onOpenChange={setShowHoldDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aufgabe pausieren?</AlertDialogTitle>
            <AlertDialogDescription>Die Arbeit an dieser Aufgabe wird pausiert. Sie können sie jederzeit fortsetzen.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea placeholder="Optionaler Grund" value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)} className="min-h-[80px]" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handlePutOnHold} disabled={actionLoading}>
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Pausieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resume Dialog */}
      <AlertDialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aufgabe fortsetzen?</AlertDialogTitle>
            <AlertDialogDescription>Die Arbeit an dieser Aufgabe wird fortgesetzt.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea placeholder="Optionaler Kommentar" value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)} className="min-h-[80px]" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleResume} disabled={actionLoading}>
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Fortsetzen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Task Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aufgabe abbrechen?</AlertDialogTitle>
            <AlertDialogDescription>Die Aufgabe wird als abgebrochen markiert. Dies kann vom Team rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea placeholder="Optionaler Grund" value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)} className="min-h-[80px]" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={actionLoading} className="bg-destructive hover:bg-destructive/90">
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Aufgabe abbrechen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Footer />
    </div>;
};
export default TaskDetail;