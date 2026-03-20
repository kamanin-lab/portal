import { useState } from 'react'
import { toast } from 'sonner'
import { SideSheet } from '@/shared/components/ui/SideSheet'
import type { Project } from '../types/project'

interface MessageSheetProps {
  project: Project
  open: boolean
  onClose: () => void
}

export function MessageSheet({ project: _project, open, onClose }: MessageSheetProps) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  function handleSend() {
    if (!message.trim()) return
    toast.success('Nachricht gesendet')
    setSubject('')
    setMessage('')
    onClose()
  }

  return (
    <SideSheet open={open} onClose={onClose} title="Nachricht senden">
      <div className="p-6">
        <h2 className="text-[18px] font-bold text-[var(--text-primary)] tracking-[-0.02em] mb-1">
          Nachricht senden
        </h2>
        <p className="text-[13px] text-[var(--text-secondary)] mb-6">
          An: KAMANIN Team
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              Betreff (optional)
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="z. B. Frage zu Phase 2…"
              className="w-full px-[12px] py-[8px] text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              Nachricht
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Ihre Nachricht…"
              rows={6}
              className="w-full px-[12px] py-[8px] text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-[14px] py-[8px] text-[13px] text-[var(--text-secondary)] border border-[var(--border)] bg-[var(--surface)] rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSend}
              disabled={!message.trim()}
              className="px-[16px] py-[8px] text-[13px] font-semibold text-white bg-[var(--accent)] rounded-[var(--r-sm)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              Senden
            </button>
          </div>
        </div>
      </div>
    </SideSheet>
  )
}
