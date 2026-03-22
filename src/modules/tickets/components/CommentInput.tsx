import { useState, useRef } from 'react';
import { Paperclip } from 'lucide-react';
import { Textarea } from '@/shared/components/ui/textarea';
import { Button } from '@/shared/components/ui/button';
import type { FileData } from '../types/tasks';
import { dict } from '../lib/dictionary';

async function fileToBase64(file: File): Promise<FileData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ name: file.name, data: result.split(',')[1], type: file.type || 'application/octet-stream' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface CommentInputProps {
  taskId: string;
  onSend: (text: string, files?: FileData[]) => Promise<void>;
  isSending: boolean;
}

export function CommentInput({ taskId: _taskId, onSend, isSending }: CommentInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && attachments.length === 0) return;
    const files = await Promise.all(attachments.map(fileToBase64));
    await onSend(text.trim(), files.length > 0 ? files : undefined);
    setText('');
    setAttachments([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      void handleSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-border-light pt-[12px]">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-[6px] mb-[8px]">
          {attachments.map((f, i) => (
            <span key={i} className="text-[11px] bg-accent-light text-accent px-[8px] py-[3px] rounded-full flex items-center gap-[4px]">
              {f.name}
              <button type="button" onClick={() => setAttachments(a => a.filter((_, j) => j !== i))} className="opacity-60 hover:opacity-100 cursor-pointer">x</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-[8px]">
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={dict.labels.typeMessage}
          rows={2}
          className="flex-1 min-h-0"
        />
        <div className="flex flex-col gap-[6px] flex-shrink-0">
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Datei anhaengen"
            variant="outline"
            size="icon"
            className="h-8 w-8"
          >
            <Paperclip size={14} />
          </Button>
          <Button
            type="submit"
            disabled={isSending || (!text.trim() && attachments.length === 0)}
            variant="accent"
            size="sm"
            className="font-semibold whitespace-nowrap"
          >
            {dict.actions.send}
          </Button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          setAttachments(a => [...a, ...files]);
          e.target.value = '';
        }}
      />
    </form>
  );
}
