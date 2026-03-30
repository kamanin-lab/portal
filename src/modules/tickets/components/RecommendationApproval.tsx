import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Idea01Icon, FlashIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/shared/components/ui/button';
import { useTaskActions } from '../hooks/useTaskActions';

function getDefaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split('T')[0];
}

interface Props {
  taskId: string;
  credits: number | null | undefined;
  onClose?: () => void;
}

export function RecommendationApproval({ taskId, credits, onClose }: Props) {
  const [mode, setMode] = useState<'buttons' | 'accepting' | 'declining'>('buttons');
  const [dueDate, setDueDate] = useState(getDefaultDueDate());
  const [comment, setComment] = useState('');
  const { acceptRecommendation, declineRecommendation, isLoading } = useTaskActions({ onSuccess: onClose });

  const displayCredits =
    credits != null && credits > 0
      ? credits % 1 === 0 ? String(credits) : credits.toFixed(1)
      : null;

  async function handleAccept() {
    const dueDateMs = dueDate ? new Date(dueDate).getTime() : undefined;
    await acceptRecommendation(taskId, dueDateMs);
  }

  async function handleDecline() {
    await declineRecommendation(taskId, comment.trim() || undefined);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="border border-amber-400/40 bg-amber-50 rounded-[var(--r-md)] p-4 mb-5"
    >
      <div className="flex items-center gap-2 mb-2">
        <HugeiconsIcon icon={Idea01Icon} size={18} className="text-amber-600" />
        <span className="text-md font-bold text-text-primary">Empfehlung</span>
      </div>

      {displayCredits && (
        <p className="text-body text-text-secondary mb-2">
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon icon={FlashIcon} size={12} className="text-text-tertiary" />
            <strong>{displayCredits} Credits</strong>
          </span>
        </p>
      )}

      <p className="text-body text-text-secondary mb-3.5">
        Unser Team hat eine Empfehlung für Sie erstellt.
      </p>

      <AnimatePresence mode="wait">
        {mode === 'buttons' && (
          <motion.div
            key="buttons"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2"
          >
            <Button
              onClick={() => setMode('accepting')}
              disabled={isLoading}
              size="sm"
              className="bg-committed hover:bg-committed/90 font-semibold"
            >
              Annehmen
            </Button>
            <Button
              onClick={() => setMode('declining')}
              disabled={isLoading}
              variant="outline"
              size="sm"
            >
              Ablehnen
            </Button>
          </motion.div>
        )}

        {mode === 'accepting' && (
          <motion.div
            key="accepting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2.5"
          >
            <p className="text-xs text-text-tertiary">Bis wann soll das erledigt werden?</p>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-[var(--r-sm)] bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <div className="flex items-center gap-2">
              <Button
                onClick={handleAccept}
                disabled={isLoading || !dueDate}
                size="sm"
                className="bg-committed hover:bg-committed/90 font-semibold"
              >
                Annehmen
              </Button>
              <Button
                onClick={() => setMode('buttons')}
                disabled={isLoading}
                size="sm"
                variant="ghost"
              >
                Abbrechen
              </Button>
            </div>
          </motion.div>
        )}

        {mode === 'declining' && (
          <motion.div
            key="declining"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2.5"
          >
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optionaler Kommentar..."
              rows={3}
              className="w-full p-2.5 text-body rounded-[var(--r-sm)] border border-border bg-bg text-text-primary placeholder:text-text-tertiary resize-y focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex items-center gap-2">
              <Button
                onClick={handleDecline}
                disabled={isLoading}
                size="sm"
                variant="outline"
              >
                Ablehnen
              </Button>
              <Button
                onClick={() => setMode('buttons')}
                disabled={isLoading}
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
