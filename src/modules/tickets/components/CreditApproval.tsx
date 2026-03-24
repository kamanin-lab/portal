import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useTaskActions } from '../hooks/useTaskActions';
import { usePostComment } from '../hooks/useTaskComments';
import { toast } from 'sonner';
import { dict } from '../lib/dictionary';

interface Props {
  taskId: string;
  credits: number;
  taskName: string;
}

export function CreditApproval({ taskId, credits, taskName: _taskName }: Props) {
  const [mode, setMode] = useState<'buttons' | 'declining'>('buttons');
  const [reason, setReason] = useState('');
  const { approveCredits, isLoading: isApproving } = useTaskActions();
  const postComment = usePostComment();

  const displayCredits = credits % 1 === 0 ? String(credits) : credits.toFixed(1);

  async function handleApprove() {
    await approveCredits(taskId);
  }

  async function handleDecline() {
    if (!reason.trim()) return;
    try {
      await postComment.mutateAsync({
        taskId,
        comment: `Kostenfreigabe abgelehnt: ${reason.trim()}`,
      });
      toast.success(dict.toasts.creditDeclineSent);
      setMode('buttons');
      setReason('');
    } catch {
      toast.error(dict.toasts.creditDeclineError);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="border border-amber-400/40 bg-amber-50 rounded-[var(--r-md)] p-[16px] mb-5"
    >
      <div className="flex items-center gap-[8px] mb-[8px]">
        <Zap size={18} className="text-amber-600 fill-amber-500" />
        <span className="text-[15px] font-bold text-text-primary">
          Kostenfreigabe erforderlich
        </span>
      </div>

      <p className="text-[13px] text-text-secondary mb-[14px]">
        Diese Aufgabe wurde mit <strong>{displayCredits} Credits</strong> bewertet.
      </p>

      <AnimatePresence mode="wait">
        {mode === 'buttons' ? (
          <motion.div
            key="buttons"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-[8px]"
          >
            <Button
              onClick={handleApprove}
              disabled={isApproving || postComment.isPending}
              size="sm"
              className="bg-committed hover:bg-committed/90 font-semibold"
            >
              Akzeptieren
            </Button>
            <Button
              onClick={() => setMode('declining')}
              disabled={isApproving || postComment.isPending}
              variant="outline"
              size="sm"
            >
              Besprechen
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="declining"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-[10px]"
          >
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Bitte beschreiben Sie, warum Sie die Bewertung ablehnen..."
              className="w-full min-h-[80px] p-[10px] text-[13px] rounded-[var(--r-sm)] border border-border bg-bg text-text-primary placeholder:text-text-tertiary resize-y focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex items-center gap-[8px]">
              <Button
                onClick={handleDecline}
                disabled={!reason.trim() || postComment.isPending}
                size="sm"
                variant="outline"
              >
                Absenden
              </Button>
              <Button
                onClick={() => { setMode('buttons'); setReason(''); }}
                disabled={postComment.isPending}
                size="sm"
                variant="ghost"
              >
                Abbrechen
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
