import { PriorityIcon } from './PriorityIcon';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { dict } from '../lib/dictionary';

const PRIORITIES = [
  { value: 1 as const, key: 'urgent', label: 'Dringend', color: 'var(--destructive)', bg: 'var(--destructive-bg)' },
  { value: 2 as const, key: 'high', label: 'Hoch', color: 'var(--phase-3)', bg: 'var(--phase-3-light)' },
  { value: 3 as const, key: 'normal', label: 'Normal', color: 'var(--phase-2)', bg: 'var(--phase-2-light)' },
  { value: 4 as const, key: 'low', label: 'Niedrig', color: 'var(--text-tertiary)', bg: 'var(--upcoming-bg)' },
];

interface TicketFormFieldsProps {
  subject: string;
  onSubjectChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  priority: 1 | 2 | 3 | 4;
  onPriorityChange: (v: 1 | 2 | 3 | 4) => void;
}

export function TicketFormFields({
  subject, onSubjectChange,
  description, onDescriptionChange,
  priority, onPriorityChange,
}: TicketFormFieldsProps) {
  return (
    <>
      {/* Subject */}
      <div className="mb-3.5">
        <label className="block text-body font-medium text-text-secondary mb-1.5">
          {dict.dialogs.subjectLabel}
        </label>
        <Input
          value={subject}
          onChange={e => onSubjectChange(e.target.value)}
          placeholder={dict.dialogs.subjectPlaceholder}
          required
        />
      </div>

      {/* Description */}
      <div className="mb-3.5">
        <label className="block text-body font-medium text-text-secondary mb-1.5">
          {dict.dialogs.descLabel}
        </label>
        <Textarea
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
          placeholder={dict.dialogs.descPlaceholder}
          rows={4}
        />
      </div>

      {/* Priority selector */}
      <div className="mb-3.5">
        <label className="block text-body font-medium text-text-secondary mb-1.5">
          Prioritaet
        </label>
        <div className="flex gap-1.5">
          {PRIORITIES.map(p => {
            const selected = priority === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onPriorityChange(p.value)}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-[var(--r-sm)] border transition-all duration-150 cursor-pointer"
                style={{
                  background: selected ? p.bg : 'transparent',
                  borderColor: selected ? p.color : 'var(--border)',
                  color: selected ? p.color : 'var(--text-tertiary)',
                }}
              >
                <PriorityIcon priority={p.key} size={12} />
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
