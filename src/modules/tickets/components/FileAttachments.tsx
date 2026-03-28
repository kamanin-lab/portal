import { HugeiconsIcon } from '@hugeicons/react';
import { MultiplicationSignIcon, Attachment01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/shared/components/ui/button';

interface FileAttachmentsProps {
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function FileAttachments({ files, setFiles, fileInputRef }: FileAttachmentsProps) {
  return (
    <div className="mb-3.5">
      <label className="block text-body font-medium text-text-secondary mb-1.5">Anhänge</label>
      <input
        ref={fileInputRef}
        type="file" multiple className="hidden"
        onChange={e => { const selected = Array.from(e.target.files || []); setFiles(prev => [...prev, ...selected].slice(0, 5)); e.target.value = ''; }}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
      />
      <Button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={files.length >= 5}
        variant="outline"
        size="sm"
        className="text-xs border-dashed"
      >
        <HugeiconsIcon icon={Attachment01Icon} size={13} />
        Dateien hinzufügen
      </Button>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-surface-active rounded text-xxs text-text-secondary">
              {f.name}
              <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="hover:text-red-500 cursor-pointer">
                <HugeiconsIcon icon={MultiplicationSignIcon} size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-xxs text-text-tertiary mt-1">Max. 5 Dateien, je 10 MB</p>
    </div>
  );
}
