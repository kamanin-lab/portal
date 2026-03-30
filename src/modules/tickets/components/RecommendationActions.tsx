import { useState, useCallback } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog'
import { Textarea } from '@/shared/components/ui/textarea'
import { useTaskActions } from '../hooks/useTaskActions'
import { dict } from '../lib/dictionary'
import type { ClickUpTask } from '../types/tasks'

function getDefaultDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().split('T')[0]
}

interface Props {
  onAcceptRef: (fn: (task: ClickUpTask) => void) => void
  onDeclineRef: (fn: (task: ClickUpTask) => void) => void
}

export function RecommendationActions({ onAcceptRef, onDeclineRef }: Props) {
  const [mode, setMode] = useState<'accept' | 'decline' | null>(null)
  const [selectedTask, setSelectedTask] = useState<ClickUpTask | null>(null)
  const [dueDate, setDueDate] = useState(getDefaultDueDate())
  const [comment, setComment] = useState('')
  const { acceptRecommendation, declineRecommendation, isLoading } = useTaskActions()

  const openAccept = useCallback((task: ClickUpTask) => {
    setSelectedTask(task)
    setDueDate(getDefaultDueDate())
    setMode('accept')
  }, [])

  const openDecline = useCallback((task: ClickUpTask) => {
    setSelectedTask(task)
    setComment('')
    setMode('decline')
  }, [])

  onAcceptRef(openAccept)
  onDeclineRef(openDecline)

  function close() {
    setMode(null)
    setSelectedTask(null)
  }

  async function handleAccept() {
    if (!selectedTask) return
    const dueDateMs = new Date(dueDate).getTime()
    await acceptRecommendation(selectedTask.clickup_id, dueDateMs)
    close()
  }

  async function handleDecline() {
    if (!selectedTask) return
    await declineRecommendation(selectedTask.clickup_id, comment.trim() || undefined)
    close()
  }

  return (
    <>
      {/* Accept dialog */}
      <AlertDialog open={mode === 'accept'} onOpenChange={(open) => { if (!open) close() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.dialogs.acceptTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dict.dialogs.acceptMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-[var(--r-sm)] bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>{dict.actions.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleAccept} disabled={isLoading || !dueDate}>
              {dict.dialogs.acceptConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Decline dialog */}
      <AlertDialog open={mode === 'decline'} onOpenChange={(open) => { if (!open) close() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.dialogs.declineTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dict.dialogs.declineMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={dict.dialogs.declinePlaceholder}
              rows={3}
              className="resize-none"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>{dict.actions.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDecline} disabled={isLoading}>
              {dict.dialogs.declineConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
