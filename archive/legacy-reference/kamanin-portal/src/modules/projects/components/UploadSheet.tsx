import { useState, useRef } from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { SideSheet } from '@/shared/components/ui/SideSheet'
import type { Project } from '../types/project'

interface UploadSheetProps {
  project: Project
  open: boolean
  onClose: () => void
}

export function UploadSheet({ project, open, onClose }: UploadSheetProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedStepId, setSelectedStepId] = useState('')
  const [note, setNote] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const allSteps = project.chapters.flatMap(ch =>
    ch.steps.map(s => ({ id: s.id, label: `${ch.title} — ${s.title}` }))
  )

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) setSelectedFile(file)
  }

  function handleUpload() {
    if (!selectedFile) return
    toast.success('Datei hochgeladen')
    setSelectedFile(null)
    setSelectedStepId('')
    setNote('')
    onClose()
  }

  return (
    <SideSheet open={open} onClose={onClose} title="Datei hochladen">
      <div className="p-6">
        <h2 className="text-[18px] font-bold text-[var(--text-primary)] tracking-[-0.02em] mb-6">
          Datei hochladen
        </h2>

        <div className="flex flex-col gap-4">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-[var(--r-md)] p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-[var(--accent)] bg-[var(--accent-light)]'
                : selectedFile
                  ? 'border-[var(--committed)] bg-[#F0FDF4]'
                  : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            <Upload size={22} className="mx-auto mb-3 opacity-50" />
            {selectedFile ? (
              <p className="text-[13px] font-medium text-[var(--text-primary)]">{selectedFile.name}</p>
            ) : (
              <p className="text-[13px] text-[var(--text-secondary)]">
                Dateien hierher ziehen oder <strong className="text-[var(--accent)]">klicken</strong>
              </p>
            )}
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setSelectedFile(f) }}
            />
          </div>

          {/* Step selector */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              Schritt zuordnen (optional)
            </label>
            <select
              value={selectedStepId}
              onChange={e => setSelectedStepId(e.target.value)}
              className="w-full px-[12px] py-[8px] text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
            >
              <option value="">— Keinem Schritt zuordnen —</option>
              {allSteps.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              Notiz (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="z. B. Finales Logo v3…"
              className="w-full px-[12px] py-[8px] text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
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
              onClick={handleUpload}
              disabled={!selectedFile}
              className="px-[16px] py-[8px] text-[13px] font-semibold text-white bg-[var(--accent)] rounded-[var(--r-sm)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              Hochladen
            </button>
          </div>
        </div>
      </div>
    </SideSheet>
  )
}
