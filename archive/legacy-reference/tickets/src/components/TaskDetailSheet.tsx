import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Task } from '@/types';
import { statusConfig, priorityConfig } from '@/data/mockData';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  CalendarDays, 
  Clock, 
  AlertCircle,
  MessageSquare,
  CheckCircle2,
  RotateCcw,
  Loader2,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Timer,
  Pause,
  Play,
  XCircle,
} from 'lucide-react';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { formatTimeEstimate } from '@/lib/utils';
import { useTaskComments, usePostComment } from '@/hooks/useTaskComments';
import { useTaskActions } from '@/hooks/useTaskActions';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { CommentInput, FileData } from '@/components/CommentInput';
import { CommentAttachments } from '@/components/CommentAttachments';
import { LinkifiedText } from '@/components/LinkifiedText';

interface TaskDetailSheetProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAGE_OPTIONS = [5, 10, 25];

const TaskDetailSheet = React.forwardRef<HTMLDivElement, TaskDetailSheetProps>(
  ({ task, open, onOpenChange }, ref) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { markAsRead } = useUnreadCounts(user?.id);
    const { data: comments, isLoading: commentsLoading } = useTaskComments(open && task ? task.id : null);
    const { approveTask, requestChanges, putOnHold, resumeTask, cancelTask, isLoading: actionLoading } = useTaskActions();
    const { mutateAsync: postComment, isPending: isPostingComment } = usePostComment();
    
    const [showApproveDialog, setShowApproveDialog] = useState(false);
    const [showChangesDialog, setShowChangesDialog] = useState(false);
    const [showHoldDialog, setShowHoldDialog] = useState(false);
    const [showResumeDialog, setShowResumeDialog] = useState(false);
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [feedbackComment, setFeedbackComment] = useState('');
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [commentsPerPage, setCommentsPerPage] = useState(5);
    
    // Ref to prevent duplicate markAsRead calls
    const hasMarkedReadRef = useRef<string | null>(null);

    // Mark task as read when sheet opens (only once per task per open)
    useEffect(() => {
      if (open && task?.id && hasMarkedReadRef.current !== task.id) {
        hasMarkedReadRef.current = task.id;
        markAsRead(`task:${task.id}`);
      }
      if (!open) {
        hasMarkedReadRef.current = null;
      }
    }, [open, task?.id, markAsRead]);

    // Calculate pagination
    const totalComments = comments?.length || 0;
    const totalPages = Math.ceil(totalComments / commentsPerPage);
    const startIndex = (currentPage - 1) * commentsPerPage;
    const endIndex = startIndex + commentsPerPage;
    const paginatedComments = comments?.slice(startIndex, endIndex) || [];

    // Reset to page 1 when per-page count changes or task changes
    useEffect(() => {
      setCurrentPage(1);
    }, [commentsPerPage, task?.id]);

    const handleOpenFullPage = () => {
      onOpenChange(false);
      navigate(`/task/${task?.id}`);
    };

    if (!task) return null;

    const status = statusConfig[task.status];
    const priority = priorityConfig[task.priority];
    
    const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate)) && task.status !== 'done';
    const isDueToday = task.dueDate && isToday(parseISO(task.dueDate));

    const canTakeAction = task.status === 'needs_attention';
    const canHoldOrCancel = task.status !== 'done' && task.status !== 'cancelled';

    const handleOpenInClickUp = () => {
      if (task.clickupUrl) {
        window.open(task.clickupUrl, '_blank', 'noopener,noreferrer');
      }
    };

    const handleApprove = async () => {
      try {
        await approveTask(task.id, feedbackComment || undefined);
        setShowApproveDialog(false);
        setFeedbackComment('');
        onOpenChange(false);
      } catch {
        // Error handled by the hook
      }
    };

    const handleRequestChanges = async () => {
      try {
        await requestChanges(task.id, feedbackComment || undefined);
        setShowChangesDialog(false);
        setFeedbackComment('');
        onOpenChange(false);
      } catch {
        // Error handled by the hook
      }
    };

    const handlePutOnHold = async () => {
      try {
        await putOnHold(task.id, feedbackComment || undefined);
        setShowHoldDialog(false);
        setFeedbackComment('');
        onOpenChange(false);
      } catch {}
    };

    const handleResume = async () => {
      try {
        await resumeTask(task.id, feedbackComment || undefined);
        setShowResumeDialog(false);
        setFeedbackComment('');
        onOpenChange(false);
      } catch {}
    };

    const handleCancel = async () => {
      try {
        await cancelTask(task.id, feedbackComment || undefined);
        setShowCancelDialog(false);
        setFeedbackComment('');
        onOpenChange(false);
      } catch {}
    };

    const getInitials = (name: string) => {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const handlePostComment = async (comment: string, files: FileData[]) => {
      await postComment({ taskId: task.id, comment, files });
    };

    return (
      <>
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent ref={ref} className="w-full md:w-[70%] lg:w-[55%] xl:w-[40%] max-w-2xl overflow-y-auto overflow-x-hidden">
            <SheetHeader className="text-left">
              <div className="flex items-start gap-2">
                <Badge variant={status.variant} className="shrink-0 mt-1">
                  {status.label}
                </Badge>
                <Badge variant="outline" className={`shrink-0 mt-1 ${priority.className}`}>
                  {priority.label}
                </Badge>
              </div>
              <SheetTitle className="text-xl leading-tight pr-4">
                {task.title}
              </SheetTitle>
              <Button
                variant="ghost-outline"
                size="sm"
                onClick={handleOpenFullPage}
                className="gap-1.5 mt-2 w-fit"
              >
                <Maximize2 className="h-4 w-4" />
                Vollansicht öffnen
              </Button>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Due Date & Timeline */}
              <div className="flex flex-wrap gap-4">
                {task.dueDate && (
                  <div className={`flex items-center gap-2 text-sm ${
                    isOverdue ? 'text-destructive' : isDueToday ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'
                  }`}>
                    <CalendarDays className="h-4 w-4" />
                    <div>
                      <span className="font-medium">Fällig:</span>{' '}
                      {isOverdue && (
                        <span className="inline-flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Überfällig -
                        </span>
                      )}
                      {isDueToday && 'Heute fällig - '}
                      {format(parseISO(task.dueDate), 'dd.MM.yyyy')}
                    </div>
                  </div>
                )}
                
              {task.createdAt && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Erstellt von {task.createdByName || 'Team'} am {format(parseISO(task.createdAt), 'dd.MM.yyyy')}</span>
                  </div>
                )}
                
                {task.timeEstimate && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Timer className="h-4 w-4" />
                    <span><span className="font-medium">Schätzung:</span> {formatTimeEstimate(task.timeEstimate)}</span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Description */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Beschreibung</h3>
                <div className={`text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-muted/50 rounded-lg p-4 ${
                  !isDescriptionExpanded ? 'line-clamp-4' : ''
                }`}>
                  {task.description || 'Keine Beschreibung vorhanden.'}
                </div>
                {task.description && task.description.length > 200 && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    className="px-0 h-auto text-xs text-primary"
                  >
                    {isDescriptionExpanded ? 'Weniger anzeigen' : 'Mehr lesen'}
                  </Button>
                )}
              </div>

              <Separator />

              {/* Actions */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Aktionen</h3>
                <div className="flex flex-col gap-2">
                  {/* Primary actions - only in Needs Your Attention */}
                  {canTakeAction && (
                    <>
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => setShowApproveDialog(true)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                          disabled={actionLoading}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                           Freigeben
                        </Button>
                        <Button 
                          onClick={() => setShowChangesDialog(true)}
                          variant="outline"
                          className="flex-1"
                          disabled={actionLoading}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                           Änderungen anfordern
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground bg-primary/10 rounded-lg p-3">
                        💡 Diese Aufgabe wartet auf Ihre Überprüfung. Geben Sie sie frei oder fordern Sie Änderungen an.
                      </p>
                    </>
                  )}
                  
                  {task.status === 'on_hold' && (
                    <p className="text-xs text-muted-foreground bg-orange-500/10 rounded-lg p-3">
                      ⏸️ Diese Aufgabe ist derzeit pausiert.
                    </p>
                  )}

                  {task.status === 'approved' && (
                    <p className="text-xs text-muted-foreground bg-emerald-500/10 rounded-lg p-3">
                      ✅ Sie haben diese Aufgabe freigegeben. Das Team wird mit der Umsetzung fortfahren.
                    </p>
                  )}

                  {/* Secondary actions - Hold / Resume / Cancel */}
                  {canHoldOrCancel && (
                    <div className="flex gap-2 pt-1">
                      {task.status === 'on_hold' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowResumeDialog(true)}
                          disabled={actionLoading}
                          className="text-xs"
                        >
                          <Play className="h-3.5 w-3.5 mr-1" />
                           Fortsetzen
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowHoldDialog(true)}
                          disabled={actionLoading}
                          className="text-xs"
                        >
                          <Pause className="h-3.5 w-3.5 mr-1" />
                           Pausieren
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCancelDialog(true)}
                        disabled={actionLoading}
                        className="text-xs text-destructive hover:text-destructive"
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                         Aufgabe abbrechen
                      </Button>
                    </div>
                  )}

                  {!canTakeAction && !canHoldOrCancel && (
                    <p className="text-sm text-muted-foreground">
                      Für diesen Status sind keine Aktionen verfügbar.
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Comments Section */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Kommentare
                  {totalComments > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {totalComments}
                    </Badge>
                  )}
                </h3>
                
                {/* Comment Input - Now at the top */}
                <CommentInput
                  onSubmit={handlePostComment}
                  isSubmitting={isPostingComment}
                  placeholder="Kommentar schreiben..."
                  maxLength={10000}
                  compact
                />

                {/* Pagination Controls */}
                {totalComments > 0 && (
                  <div className="flex items-center justify-between gap-2 py-2 border-y">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Anzeigen:</span>
                      <Select 
                        value={String(commentsPerPage)} 
                        onValueChange={(v) => setCommentsPerPage(Number(v))}
                      >
                        <SelectTrigger className="w-16 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAGE_OPTIONS.map(opt => (
                            <SelectItem key={opt} value={String(opt)}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {totalPages > 1 && (
                      <div className="flex items-center gap-1">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          disabled={currentPage === 1} 
                          onClick={() => setCurrentPage(p => p - 1)}
                          className="h-7 w-7 p-0"
                        >
                          <ChevronLeft className="h-3 w-3" />
                        </Button>
                        <span className="text-xs text-muted-foreground px-1">
                          {currentPage}/{totalPages}
                        </span>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          disabled={currentPage === totalPages} 
                          onClick={() => setCurrentPage(p => p + 1)}
                          className="h-7 w-7 p-0"
                        >
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {commentsLoading ? (
                  <div className="space-y-3">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-12 w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : paginatedComments.length > 0 ? (
                  <div className="space-y-4">
                    {paginatedComments.map((comment) => (
                      <div key={comment.id} className="flex gap-3">
                        <Avatar className="h-8 w-8 shrink-0">
                          {comment.author.avatar && (
                            <AvatarImage src={comment.author.avatar} alt={comment.author.name} />
                          )}
                          <AvatarFallback className="text-xs">
                            {getInitials(comment.author.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium truncate">
                              {comment.author.name}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {format(parseISO(comment.created_at), 'dd.MM., HH:mm')}
                            </span>
                          </div>
                          <div className="text-sm text-foreground bg-muted/50 rounded-lg p-2 whitespace-pre-wrap break-words">
                            <LinkifiedText text={comment.text} />
                          </div>
                          {/* Attachments */}
                          {comment.attachments && comment.attachments.length > 0 && (
                            <CommentAttachments 
                              attachments={comment.attachments}
                              isFromPortal={comment.isFromPortal}
                              className="mt-2"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Noch keine Kommentare. Schreiben Sie den ersten!
                  </p>
                )}
              </div>

              {/* Sync Info */}
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  Zuletzt synchronisiert: {task.lastSynced ? format(parseISO(task.lastSynced), 'dd.MM., HH:mm') : 'Unbekannt'}
                </p>
              </div>
            </div>
          </SheetContent>
        </Sheet>

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
              <Textarea
                placeholder="Optionalen Kommentar hinzufügen (z. B. 'Sieht gut aus!' oder spezifisches Feedback)"
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                className="min-h-[80px]"
              />
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
                Die Aufgabe wird zur Überarbeitung zurückgesendet. Bitte beschreiben Sie die gewünschten Änderungen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
                <Textarea
                placeholder="Beschreiben Sie die gewünschten Änderungen (erforderlich)"
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                className="min-h-[100px]"
                required
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionLoading}>Abbrechen</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleRequestChanges} 
                disabled={actionLoading || !feedbackComment.trim()}
                className="bg-orange-600 hover:bg-orange-700"
              >
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
              <AlertDialogDescription>
                Die Arbeit an dieser Aufgabe wird pausiert. Sie können sie jederzeit fortsetzen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Textarea
                placeholder="Optionalen Grund für die Pause angeben"
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                className="min-h-[80px]"
              />
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
              <AlertDialogDescription>
                Die Arbeit an dieser Aufgabe wird fortgesetzt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Textarea
                placeholder="Optionalen Kommentar hinzufügen"
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                className="min-h-[80px]"
              />
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
              <AlertDialogDescription>
                Die Aufgabe wird als abgebrochen markiert. Diese Aktion kann von Ihrem Team rückgängig gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Textarea
                placeholder="Optionalen Grund für den Abbruch angeben"
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionLoading}>Abbrechen</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleCancel} 
                disabled={actionLoading}
                className="bg-destructive hover:bg-destructive/90"
              >
                {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Aufgabe abbrechen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }
);

TaskDetailSheet.displayName = 'TaskDetailSheet';

export default TaskDetailSheet;
