import { useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useCreateTask } from '../hooks/useCreateTask';
import { dict } from '../lib/dictionary';

interface NewTicketDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewTicketDialog({ open, onClose }: NewTicketDialogProps) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const { mutateAsync: createTask, isPending } = useCreateTask();
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;
    try {
      await createTask({ name: subject.trim(), description: description.trim() || undefined, priority: 3, files: [] });
      setSubject('');
      setDescription('');
      onClose();
    } catch {
      // error toast handled by useCreateTask
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }}
        />
        <Dialog.Content
          style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-xl)',
            padding: '28px 24px 24px', width: 'min(480px, calc(100vw - 32px))', zIndex: 51,
          }}
        >
          <Dialog.Title className="text-[16px] font-semibold text-text-primary mb-[18px]">
            {dict.dialogs.newTicketTitle}
          </Dialog.Title>
          <form ref={formRef} onSubmit={handleSubmit}>
            <div className="mb-[14px]">
              <label className="block text-[12.5px] font-medium text-text-secondary mb-[6px]">
                {dict.dialogs.subjectLabel}
              </label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder={dict.dialogs.subjectPlaceholder}
                required
                className="w-full px-[12px] py-[8px] text-[13px] bg-surface border border-border rounded-[var(--r-sm)] outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="mb-[20px]">
              <label className="block text-[12.5px] font-medium text-text-secondary mb-[6px]">
                {dict.dialogs.descLabel}
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={dict.dialogs.descPlaceholder}
                rows={4}
                className="w-full px-[12px] py-[8px] text-[13px] bg-surface border border-border rounded-[var(--r-sm)] outline-none focus:border-accent transition-colors resize-none"
              />
            </div>
            <div className="flex justify-end gap-[10px]">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="px-[16px] py-[8px] text-[13.5px] border border-border bg-surface text-text-secondary rounded-[var(--r-md)] hover:bg-surface-hover transition-colors cursor-pointer"
              >
                {dict.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={isPending || !subject.trim()}
                className="px-[16px] py-[8px] text-[13.5px] font-semibold bg-cta text-white rounded-[var(--r-md)] hover:bg-cta-hover transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isPending ? dict.labels.loading : dict.dialogs.submitLabel}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
