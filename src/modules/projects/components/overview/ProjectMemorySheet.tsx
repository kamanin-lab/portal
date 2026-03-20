import { useEffect, useState } from 'react';
import type { MemoryDraft, MemoryEntry } from '../../types/memory';
import { SideSheet } from '@/shared/components/ui/SideSheet';

interface MemoryEntrySheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: MemoryDraft, entryId?: string) => Promise<void>;
  initialEntry?: MemoryEntry | null;
  isSaving?: boolean;
}

const CATEGORY_OPTIONS: Array<[MemoryDraft['category'], string]> = [
  ['profile', 'Profile'],
  ['communication', 'Communication'],
  ['technical_constraint', 'Technical constraint'],
  ['delivery_constraint', 'Delivery constraint'],
  ['decision', 'Decision'],
  ['risk', 'Risk'],
  ['commercial_context', 'Commercial context'],
];

const VISIBILITY_OPTIONS: Array<[NonNullable<MemoryDraft['visibility']>, string]> = [
  ['internal', 'Internal'],
  ['shared', 'Shared'],
  ['client_visible', 'Client visible'],
];

export function MemoryEntrySheet({ open, onClose, onSubmit, initialEntry, isSaving = false }: MemoryEntrySheetProps) {
  const [scope, setScope] = useState<MemoryDraft['scope']>('project');
  const [category, setCategory] = useState<MemoryDraft['category']>('decision');
  const [visibility, setVisibility] = useState<NonNullable<MemoryDraft['visibility']>>('internal');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (!open) return;
    setScope(initialEntry?.scope ?? 'project');
    setCategory(initialEntry?.category ?? 'decision');
    setVisibility(initialEntry?.visibility ?? 'internal');
    setTitle(initialEntry?.title ?? '');
    setBody(initialEntry?.body ?? '');
  }, [open, initialEntry]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await onSubmit({
      scope,
      category,
      visibility,
      title,
      body,
    }, initialEntry?.id);
  }

  return (
    <SideSheet open={open} onClose={onClose} title={initialEntry ? 'Edit memory entry' : 'Add memory entry'}>
      <form onSubmit={handleSubmit} className="flex h-full flex-col">
        <div className="px-[20px] py-[18px] border-b border-[var(--border)]">
          <h2 className="text-[18px] font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-[6px]">
            {initialEntry ? 'Edit memory entry' : 'Add memory entry'}
          </h2>
          <p className="text-[12.5px] text-[var(--text-secondary)] leading-[1.55]">
            Use memory only for durable context that should survive the current working thread. New entries default to internal visibility.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-[20px] py-[18px] space-y-[14px]">
          <div className="grid grid-cols-3 gap-[10px] max-[640px]:grid-cols-1">
            <Field label="Scope">
              <select value={scope} onChange={event => setScope(event.target.value as MemoryDraft['scope'])} className={fieldClassName}>
                <option value="project">Project</option>
                <option value="client">Client</option>
              </select>
            </Field>
            <Field label="Category">
              <select value={category} onChange={event => setCategory(event.target.value as MemoryDraft['category'])} className={fieldClassName}>
                {CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Visibility">
              <select value={visibility} onChange={event => setVisibility(event.target.value as NonNullable<MemoryDraft['visibility']>)} className={fieldClassName}>
                {VISIBILITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Title">
            <input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} className={fieldClassName} placeholder="Short durable context label" required />
          </Field>

          <Field label="Body">
            <textarea
              value={body}
              onChange={event => setBody(event.target.value)}
              rows={8}
              className={`${fieldClassName} resize-none`}
              placeholder="Rewrite the durable context clearly instead of copying a whole thread."
              required
            />
          </Field>
        </div>

        <div className="flex justify-end gap-[10px] border-t border-[var(--border)] px-[20px] py-[16px]">
          <button type="button" onClick={onClose} className="px-[14px] py-[8px] text-[13px] rounded-[var(--r-sm)] border border-[var(--border)] bg-white hover:bg-[var(--surface-hover)]">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || !title.trim() || !body.trim()}
            className="px-[14px] py-[8px] text-[13px] font-semibold rounded-[var(--r-sm)] bg-[var(--text-primary)] text-white disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : initialEntry ? 'Save changes' : 'Create memory'}
          </button>
        </div>
      </form>
    </SideSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[12.5px] font-medium text-[var(--text-secondary)]">
      <span className="block mb-[6px]">{label}</span>
      {children}
    </label>
  );
}

const fieldClassName = 'w-full rounded-[var(--r-sm)] border border-[var(--border)] bg-white px-[12px] py-[8px] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)] transition-colors';
