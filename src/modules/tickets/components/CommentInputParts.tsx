import { Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { dict } from '../lib/dictionary';

export function AttachmentList({
  attachments,
  onRemove,
}: {
  attachments: File[];
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3.5 pb-2">
      {attachments.map((f, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 text-xxs bg-accent-light text-accent px-2 py-1 rounded-full"
        >
          <Paperclip size={10} className="opacity-60" />
          {f.name}
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="opacity-50 hover:opacity-100 cursor-pointer ml-0.5"
          >
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}

export function InputToolbar({
  showAttachment,
  canSend,
  isSending,
  onAttachClick,
  onSubmit,
}: {
  showAttachment: boolean;
  canSend: boolean;
  isSending: boolean;
  onAttachClick: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-2.5 py-2 border-t border-border-light">
      <div className="flex items-center">
        {showAttachment && (
          <Button
            type="button"
            onClick={onAttachClick}
            variant="ghost"
            size="sm"
            className="text-text-tertiary hover:text-text-secondary gap-1.5 h-[32px] px-2.5"
          >
            <Paperclip size={14} />
            <span className="text-xs max-[768px]:hidden">Datei anhängen</span>
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xxs text-text-tertiary max-[768px]:hidden select-none">
          Ctrl+Enter
        </span>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isSending || !canSend}
          variant="accent"
          size="sm"
          className="font-semibold gap-1.5 h-[32px] px-3.5"
        >
          <Send size={13} />
          {dict.actions.send}
        </Button>
      </div>
    </div>
  );
}
