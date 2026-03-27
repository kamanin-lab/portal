interface ChapterOption {
  id: string;
  title: string;
  clickup_cf_option_id: string;
}

interface ProjectTaskFormFieldsProps {
  chapters: ChapterOption[];
  selectedChapter: string;
  onChapterChange: (v: string) => void;
}

export function ProjectTaskFormFields({ chapters, selectedChapter, onChapterChange }: ProjectTaskFormFieldsProps) {
  if (chapters.length === 0) return null;

  return (
    <div className="mb-3.5">
      <label className="block text-body font-medium text-text-secondary mb-1.5">
        Phase
      </label>
      <select
        value={selectedChapter}
        onChange={e => onChapterChange(e.target.value)}
        className="w-full px-3 py-2 text-body bg-surface border border-border rounded-[var(--r-sm)] outline-none focus:border-accent transition-colors cursor-pointer"
      >
        <option value="">Keine Phase zugewiesen</option>
        {chapters.map(ch => (
          <option key={ch.id} value={ch.id}>{ch.title}</option>
        ))}
      </select>
    </div>
  );
}
