import { useEffect, useState } from 'react';
import type { MemoryDraft, MemoryEntry } from '../../types/memory';
import { SideSheet } from '@/shared/components/ui/SideSheet';
import { Button } from '@/shared/components/ui/button';

interface MemoryEntrySheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: MemoryDraft, entryId?: string) => Promise<void>;
  initialEntry?: MemoryEntry | null;
  isSaving?: boolean;
}

const CATEGORY_OPTIONS: Array<[MemoryDraft['category'], string]> = [
  ['profile', 'Profil'],
  ['communication', 'Kommunikation'],
  ['technical_constraint', 'Technische Einschränkung'],
  ['delivery_constraint', 'Liefereinschränkung'],
  ['decision', 'Entscheidung'],
  ['risk', 'Risiko'],
  ['commercial_context', 'Kommerzieller Kontext'],
];

const VISIBILITY_OPTIONS: Array<[NonNullable<MemoryDraft['visibility']>, string]> = [
  ['internal', 'Intern'],
  ['shared', 'Geteilt'],
  ['client_visible', 'Für Kunden sichtbar'],
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
    <SideSheet open={open} onClose={onClose} title={initialEntry ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen'}>
      <form onSubmit={handleSubmit} className="flex h-full flex-col">
        <div className="px-5 py-5 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-1.5">
            {initialEntry ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen'}
          </h2>
          <p className="text-body text-[var(--text-secondary)] leading-[1.55]">
            Verwenden Sie Memory nur für dauerhaften Kontext, der über den aktuellen Arbeitsthread hinaus bestehen soll. Neue Einträge sind standardmäßig intern sichtbar.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3.5">
          <div className="grid grid-cols-3 gap-2.5 max-[640px]:grid-cols-1">
            <Field label="Bereich">
              <select value={scope} onChange={event => setScope(event.target.value as MemoryDraft['scope'])} className={fieldClassName}>
                <option value="project">Projekt</option>
                <option value="client">Kunde</option>
              </select>
            </Field>
            <Field label="Kategorie">
              <select value={category} onChange={event => setCategory(event.target.value as MemoryDraft['category'])} className={fieldClassName}>
                {CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Sichtbarkeit">
              <select value={visibility} onChange={event => setVisibility(event.target.value as NonNullable<MemoryDraft['visibility']>)} className={fieldClassName}>
                {VISIBILITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Titel">
            <input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} className={fieldClassName} placeholder="Kurze Kontextbezeichnung" required />
          </Field>

          <Field label="Inhalt">
            <textarea
              value={body}
              onChange={event => setBody(event.target.value)}
              rows={8}
              className={`${fieldClassName} resize-none`}
              placeholder="Formulieren Sie den dauerhaften Kontext klar, anstatt einen ganzen Thread zu kopieren."
              required
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-[var(--border)] px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            disabled={isSaving || !title.trim() || !body.trim()}
          >
            {isSaving ? 'Speichern…' : initialEntry ? 'Änderungen speichern' : 'Eintrag erstellen'}
          </Button>
        </div>
      </form>
    </SideSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-body font-medium text-[var(--text-secondary)]">
      <span className="block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const fieldClassName = 'w-full rounded-[var(--r-sm)] border border-[var(--border)] bg-white px-3 py-2 text-body text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)] transition-colors';
