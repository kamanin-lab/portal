import { useRef, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { MessageCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupportTaskChat } from '@/hooks/useSupportTaskChat';
import { CommentInput, FileData } from '@/components/CommentInput';
import { CommentAttachments } from '@/components/CommentAttachments';
import { LinkifiedText } from '@/components/LinkifiedText';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';

interface SupportChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAGE_OPTIONS = [5, 10, 25];

/**
 * Support Chat Sheet - uses the exact same task comments pipeline as TaskDetailSheet.
 * Displays comments for the user's support_task_id from their profile.
 */
export function SupportChatSheet({ open, onOpenChange }: SupportChatSheetProps) {
  const { comments, isLoading, sendMessage, isSending, isConfigured } = useSupportTaskChat();
  const { user } = useAuth();
  const { markAsRead } = useUnreadCounts(user?.id);
  const hasMarkedReadRef = useRef(false);

  // Pagination (same as TaskDetailSheet)
  const [currentPage, setCurrentPage] = useState(1);
  const [commentsPerPage, setCommentsPerPage] = useState(5);

  // Mark as read when sheet opens (only once per open)
  useEffect(() => {
    if (open && !hasMarkedReadRef.current) {
      hasMarkedReadRef.current = true;
      markAsRead('support');
    }
    if (!open) {
      hasMarkedReadRef.current = false;
    }
  }, [open, markAsRead]);

  // Pagination calculations (comments are already newest-first from useTaskComments)
  const totalComments = comments.length;
  const totalPages = Math.ceil(totalComments / commentsPerPage);
  const startIndex = (currentPage - 1) * commentsPerPage;
  const paginatedComments = comments.slice(startIndex, startIndex + commentsPerPage);

  // Reset to page 1 when per-page count changes
  useEffect(() => {
    setCurrentPage(1);
  }, [commentsPerPage]);

  const handleSend = async (comment: string, files: FileData[]) => {
    await sendMessage(comment, files);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Not configured state
  if (!isConfigured) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full md:w-[70%] lg:w-[55%] xl:w-[40%] max-w-2xl flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              Support Chat
            </SheetTitle>
            <SheetDescription>Stellen Sie Fragen oder erhalten Sie Hilfe von unserem Team</SheetDescription>
          </SheetHeader>
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center">
              Der Support-Chat ist für Ihr Konto nicht konfiguriert.
              <br />
              Bitte kontaktieren Sie Ihren Administrator.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full md:w-[70%] lg:w-[55%] xl:w-[40%] max-w-2xl flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Support Chat
            {totalComments > 0 && (
              <Badge variant="secondary" className="text-xs">
                {totalComments}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>Stellen Sie Fragen oder erhalten Sie Hilfe von unserem Team</SheetDescription>
        </SheetHeader>

        {/* Input at top - same as TaskDetailSheet */}
        <div className="border-b py-3">
          <CommentInput
            onSubmit={handleSend}
            isSubmitting={isSending}
            placeholder="Ihre Nachricht eingeben..."
            maxLength={5000}
            compact
          />
        </div>

        {/* Pagination Controls - same as TaskDetailSheet */}
        {totalComments > 0 && (
          <div className="flex items-center justify-between gap-2 py-2 border-b">
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
                  {PAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={String(opt)}>
                      {opt}
                    </SelectItem>
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
                  onClick={() => setCurrentPage((p) => p - 1)}
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
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Comments - EXACT SAME RENDERING AS TaskDetailSheet lines 386-418 */}
        <ScrollArea className="flex-1">
          <div className="py-4 space-y-4">
            {isLoading ? (
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
                      {/* Attachments - same component as TaskDetailSheet */}
                      {comment.attachments && comment.attachments.length > 0 && (
                        <CommentAttachments attachments={comment.attachments} isFromPortal={comment.isFromPortal} className="mt-2" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Noch keine Nachrichten. Starten Sie eine Unterhaltung!
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
