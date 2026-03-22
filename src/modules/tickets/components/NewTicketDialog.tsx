import { useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useCreateTask } from '../hooks/useCreateTask';
import { dict } from '../lib/dictionary';
import { Button } from '@/shared/components/ui/button';
import { TicketFormFields } from './TicketFormFields';
import { ProjectTaskFormFields } from './ProjectTaskFormFields';
import { FileAttachments } from './FileAttachments';

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
    setSubject(''); setDescription(''); setPriority(3); setSelectedChapter(''); setFiles([]);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;
    const chapter = chapters?.find(c => c.id === selectedChapter);
    try {
      await createTask({
        name: subject.trim(),
        description: description.trim() || undefined,
        priority, files,
        ...(isProject && listId ? { listId } : {}),
        ...(isProject && phaseFieldId && chapter ? { phaseFieldId, phaseOptionId: chapter.clickup_cf_option_id } : {}),
      });
      handleClose();
    } catch { /* error toast handled by useCreateTask */ }
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 animate-[fadeIn_150ms_ease]" />
        <Dialog.Content
          className="fixed top-0 right-0 h-full w-full max-w-[520px] bg-surface shadow-2xl flex flex-col z-50 focus:outline-none overflow-hidden data-[state=open]:animate-[slideInRight_200ms_ease] data-[state=closed]:animate-[slideOutRight_150ms_ease]"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <Dialog.Title className="text-[15px] font-semibold text-text-primary">{title}</Dialog.Title>
            <Dialog.Close className="p-1.5 rounded hover:bg-surface-hover transition-colors cursor-pointer">
              <X size={18} className="text-text-tertiary" />
            </Dialog.Close>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <TicketFormFields
                subject={subject} onSubjectChange={setSubject}
                description={description} onDescriptionChange={setDescription}
                priority={priority} onPriorityChange={setPriority}
              />
              {isProject && chapters && (
                <ProjectTaskFormFields
                  chapters={chapters}
                  selectedChapter={selectedChapter}
                  onChapterChange={setSelectedChapter}
                />
              )}
              <FileAttachments files={files} setFiles={setFiles} fileInputRef={fileInputRef} />
            </div>

            <div className="flex justify-end gap-[10px] px-5 py-4 border-t border-border shrink-0">
              <Button type="button" onClick={handleClose} disabled={isPending} variant="outline">
                {dict.actions.cancel}
              </Button>
              <Button type="submit" disabled={isPending || !subject.trim()}>
                {isPending ? dict.labels.loading : dict.dialogs.submitLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
