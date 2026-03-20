import { useState, useRef } from 'react';
import { Paperclip } from 'lucide-react';
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
              <button type="button" onClick={() => setAttachments(a => a.filter((_, j) => j !== i))} className="opacity-60 hover:opacity-100">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-[8px]">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={dict.labels.typeMessage}
          rows={2}
          className="flex-1 px-[12px] py-[8px] text-[13px] bg-surface border border-border rounded-[var(--r-sm)] outline-none focus:border-accent transition-colors resize-none"
        />
        <div className="flex flex-col gap-[6px] flex-shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Datei anhängen"
            className="p-[7px] border border-border rounded-[var(--r-sm)] text-text-tertiary hover:text-accent hover:border-accent transition-colors cursor-pointer"
          >
            <Paperclip size={14} />
          </button>
          <button
            type="submit"
            disabled={isSending || (!text.trim() && attachments.length === 0)}
            className="px-[12px] py-[7px] text-[13px] font-semibold bg-accent text-white rounded-[var(--r-sm)] hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {dict.actions.send}
          </button>
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
