import { useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Upload04Icon } from '@hugeicons/core-free-icons';

interface UploadDropZoneProps {
  selectedFile: File | null;
  onFileSelect: (file: File) => void;
}

export function UploadDropZone({ selectedFile, onFileSelect }: UploadDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-[var(--r-md)] p-8 text-center cursor-pointer transition-all ${
        isDragging
          ? 'border-[var(--accent)] bg-[var(--accent-light)]'
          : selectedFile
            ? 'border-[var(--committed)] bg-committed-bg'
            : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]'
      }`}
    >
      <HugeiconsIcon icon={Upload04Icon} size={22} className="mx-auto mb-3 opacity-50" />
      {selectedFile ? (
        <p className="text-body font-medium text-[var(--text-primary)]">{selectedFile.name}</p>
      ) : (
        <p className="text-body text-[var(--text-secondary)]">
          Dateien hierher ziehen oder <strong className="text-[var(--accent)]">klicken</strong>
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelect(f); }}
      />
    </div>
  );
}
