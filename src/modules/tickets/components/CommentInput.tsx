import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import type { FileData } from '../types/tasks';
import { dict } from '../lib/dictionary';
import { AttachmentList, InputToolbar } from './CommentInputParts';
import { useBreakpoint } from '@/shared/hooks/useBreakpoint';

async function fileToBase64(file: File): Promise<FileData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ name: file.name, base64: result.split(',')[1], type: file.type || 'application/octet-stream', size: file.size });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface CommentInputProps {
  taskId?: string;
  onSend: (text: string, files?: FileData[]) => Promise<void>;
  isSending: boolean;
  placeholder?: string;
  showAttachment?: boolean;
  minRows?: number;
  maxRows?: number;
}

const LINE_HEIGHT = 20;
const PADDING_Y = 24;

export function CommentInput({
  taskId: _taskId,
  onSend,
  isSending,
  placeholder,
  showAttachment = true,
  minRows = 3,
  maxRows = 8,
}: CommentInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isMobile } = useBreakpoint();
  const effectiveMinRows = isMobile ? 1 : minRows;
  const effectiveMaxRows = isMobile ? 4 : maxRows;

  const minHeight = effectiveMinRows * LINE_HEIGHT + PADDING_Y;
  const maxHeight = effectiveMaxRows * LINE_HEIGHT + PADDING_Y;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = `${minHeight}px`;
    const scrollH = el.scrollHeight;
    el.style.height = `${Math.min(Math.max(scrollH, minHeight), maxHeight)}px`;
  }, [minHeight, maxHeight]);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() && attachments.length === 0) return;
    const files = await Promise.all(attachments.map(fileToBase64));
    await onSend(text.trim(), files.length > 0 ? files : undefined);
    setText('');
    setAttachments([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  function removeAttachment(index: number) {
    setAttachments(a => a.filter((_, j) => j !== index));
  }

  const canSend = text.trim().length > 0 || attachments.length > 0;

  return (
    <form onSubmit={handleSubmit} className="pt-3">
      <motion.div
        animate={{
          borderColor: isFocused ? 'var(--accent)' : 'var(--border)',
          boxShadow: isFocused
            ? '0 0 0 3px rgba(43, 24, 120, 0.08)'
            : '0 0 0 0px rgba(43, 24, 120, 0)',
        }}
        transition={{ duration: 0.2 }}
        className="border rounded-[var(--r-md)] bg-surface overflow-hidden"
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder ?? dict.labels.typeMessage}
          disabled={isSending}
          style={{
            minHeight: `${minHeight}px`,
            maxHeight: `${maxHeight}px`,
            lineHeight: `${LINE_HEIGHT}px`,
          }}
          className="w-full px-3.5 py-3 text-body text-text-primary placeholder:text-text-tertiary bg-transparent border-none outline-none resize-none disabled:opacity-50"
        />

        {attachments.length > 0 && (
          <AttachmentList attachments={attachments} onRemove={removeAttachment} />
        )}

        <InputToolbar
          showAttachment={showAttachment}
          canSend={canSend}
          isSending={isSending}
          onAttachClick={() => fileInputRef.current?.click()}
          onSubmit={() => void handleSubmit()}
        />
      </motion.div>

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
