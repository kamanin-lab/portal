import { useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Paperclip } from 'lucide-react';
import { useCreateTask } from '../hooks/useCreateTask';
import { PriorityIcon } from './PriorityIcon';
import { dict } from '../lib/dictionary';

interface ChapterOption {
  id: string;
  title: string;
  clickup_cf_option_id: string;
}

interface NewTicketDialogProps {
  open: boolean;
  onClose: () => void;
  mode?: 'ticket' | 'project';
  listId?: string;
  chapters?: ChapterOption[];
  phaseFieldId?: string;
}

const PRIORITIES = [
  { value: 1 as const, key: 'urgent', label: 'Dringend', color: '#DC2626', bg: '#FEF2F2' },
  { value: 2 as const, key: 'high', label: 'Hoch', color: '#D97706', bg: '#FFFBEB' },
  { value: 3 as const, key: 'normal', label: 'Normal', color: '#2563EB', bg: '#EFF6FF' },
  { value: 4 as const, key: 'low', label: 'Niedrig', color: '#6B7280', bg: '#F9FAFB' },
];

export function NewTicketDialog({ open, onClose, mode = 'ticket', listId, chapters, phaseFieldId }: NewTicketDialogProps) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<1 | 2 | 3 | 4>(3);
  const [selectedChapter, setSelectedChapter] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const { mutateAsync: createTask, isPending } = useCreateTask();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProject = mode === 'project';
  const title = isProject ? 'Neue Projektaufgabe' : dict.dialogs.newTicketTitle;

  function handleClose() {
    setSubject('');
    setDescription('');
    setPriority(3);
    setSelectedChapter('');
    setFiles([]);
    onClose();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...selected].slice(0, 5));
    e.target.value = '';
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;

    const chapter = chapters?.find(c => c.id === selectedChapter);

    try {
      await createTask({
        name: subject.trim(),
        description: description.trim() || undefined,
        priority,
        files,
        ...(isProject && listId ? { listId } : {}),
        ...(isProject && phaseFieldId && chapter ? {
          phaseFieldId,
          phaseOptionId: chapter.clickup_cf_option_id,
        } : {}),
      });
      handleClose();
    } catch {
      // error toast handled by useCreateTask
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 animate-[fadeIn_150ms_ease]" />
        <Dialog.Content
          className="fixed top-0 right-0 h-full w-full max-w-[520px] bg-[var(--surface)] shadow-2xl flex flex-col z-50 focus:outline-none overflow-hidden data-[state=open]:animate-[slideInRight_200ms_ease] data-[state=closed]:animate-[slideOutRight_150ms_ease]"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <Dialog.Title className="text-[15px] font-semibold text-text-primary">
              {title}
            </Dialog.Title>
            <Dialog.Close className="p-1.5 rounded hover:bg-surface-hover transition-colors cursor-pointer">
              <X size={18} className="text-text-tertiary" />
            </Dialog.Close>
          </div>

          {/* Scrollable form */}
          <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {/* Subject */}
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

              {/* Description */}
              <div className="mb-[14px]">
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

              {/* Priority selector */}
              <div className="mb-[14px]">
                <label className="block text-[12.5px] font-medium text-text-secondary mb-[6px]">
                  Priorität
                </label>
                <div className="flex gap-[6px]">
                  {PRIORITIES.map(p => {
                    const selected = priority === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setPriority(p.value)}
                        className="flex-1 inline-flex items-center justify-center gap-[4px] px-[8px] py-[6px] text-[12px] font-medium rounded-[var(--r-sm)] border transition-all duration-150 cursor-pointer"
                        style={{
                          background: selected ? p.bg : 'transparent',
                          borderColor: selected ? p.color : 'var(--border)',
                          color: selected ? p.color : 'var(--text-tertiary)',
                        }}
                      >
                        <PriorityIcon priority={p.key} size={12} />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chapter selector (project mode only) */}
              {isProject && chapters && chapters.length > 0 && (
                <div className="mb-[14px]">
                  <label className="block text-[12.5px] font-medium text-text-secondary mb-[6px]">
                    Phase
                  </label>
                  <select
                    value={selectedChapter}
                    onChange={e => setSelectedChapter(e.target.value)}
                    className="w-full px-[12px] py-[8px] text-[13px] bg-surface border border-border rounded-[var(--r-sm)] outline-none focus:border-accent transition-colors cursor-pointer"
                  >
                    <option value="">Keine Phase zugewiesen</option>
                    {chapters.map(ch => (
                      <option key={ch.id} value={ch.id}>{ch.title}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* File attachments */}
              <div className="mb-[14px]">
                <label className="block text-[12.5px] font-medium text-text-secondary mb-[6px]">
                  Anhänge
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={files.length >= 5}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-text-secondary border border-dashed border-border rounded-[var(--r-sm)] hover:border-accent hover:text-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Paperclip size={13} />
                  Dateien hinzufügen
                </button>
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {files.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-surface-raised rounded text-[11px] text-text-secondary">
                        {f.name}
                        <button type="button" onClick={() => removeFile(i)} className="hover:text-red-500 cursor-pointer">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-text-tertiary mt-1">Max. 5 Dateien, je 10 MB</p>
              </div>
            </div>

            {/* Fixed footer */}
            <div className="flex justify-end gap-[10px] px-5 py-4 border-t border-border shrink-0">
              <button
                type="button"
                onClick={handleClose}
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
