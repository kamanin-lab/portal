import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Image, File } from 'lucide-react';
import type { Project, FileItem, Message } from '../../types/project';
import { UpdatesFeed } from './UpdatesFeed';
import { EmptyState } from '@/shared/components/common/EmptyState';

type Tab = 'updates' | 'dateien' | 'nachrichten';

interface OverviewTabsProps {
  project: Project;
  onOpenStep?: (stepId: string) => void;
}

export function OverviewTabs({ project: p, onOpenStep }: OverviewTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('updates');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'updates', label: 'Updates' },
    { id: 'dateien', label: 'Dateien' },
    { id: 'nachrichten', label: 'Nachrichten' },
  ];

  // Collect all files across all steps
  const allFiles: FileItem[] = p.chapters.flatMap(ch =>
    ch.steps.flatMap(s => s.files)
  );

  // Collect all messages across all steps
  const allMessages: Message[] = p.chapters.flatMap(ch =>
    ch.steps.flatMap(s => s.messages)
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-[var(--border)] flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-[20px] py-[10px] text-[12.5px] font-medium border-b-2 transition-all duration-150 cursor-pointer select-none ${
              activeTab === tab.id
                ? 'text-[var(--text-primary)] border-b-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-tertiary)] border-b-transparent hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 pt-[14px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {activeTab === 'updates' && <UpdatesFeed updates={p.updates} project={p} onOpenStep={onOpenStep} />}
        {activeTab === 'dateien' && <FilesTab files={allFiles} />}
        {activeTab === 'nachrichten' && <MessagesTab messages={allMessages} />}
      </div>
    </div>
  );
}

function FilesTab({ files }: { files: FileItem[] }) {
  const navigate = useNavigate();

  if (files.length === 0) {
    return <EmptyState message="Noch keine Dateien." />;
  }

  const recent = files.slice(0, 8);

  return (
    <div className="flex flex-col">
      {recent.map((f, idx) => (
        <div
          key={idx}
          className="flex items-center gap-[10px] px-[6px] py-[8px] rounded-[var(--r-sm)] cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-hover)]"
        >
          <FileIcon type={f.type} />
          <span className="text-[12.5px] text-[var(--text-primary)] font-medium flex-1 truncate">{f.name}</span>
          <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap">{f.size} · {f.date}</span>
        </div>
      ))}
      {files.length > 8 && (
        <button
          onClick={() => navigate('/dateien')}
          className="inline-flex items-center gap-[4px] text-[12px] text-[var(--accent)] font-medium mt-[10px] px-[6px] py-[4px] transition-opacity hover:underline"
        >
          Alle {files.length} Dateien anzeigen →
        </button>
      )}
    </div>
  );
}

function MessagesTab({ messages }: { messages: Message[] }) {
  const navigate = useNavigate();

  if (messages.length === 0) {
    return <EmptyState message="Noch keine Nachrichten." />;
  }

  const recent = messages.slice(0, 5);

  return (
    <div className="flex flex-col">
      {recent.map((msg, idx) => (
        <div
          key={idx}
          className="flex gap-[10px] px-[6px] py-[10px] rounded-[var(--r-sm)] cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-hover)]"
        >
          <div
            className={`w-[28px] h-[28px] rounded-full text-[10px] font-bold text-white flex items-center justify-center flex-shrink-0 ${
              msg.role === 'team' ? 'bg-[var(--accent)]' : 'bg-[#7C3AED]'
            }`}
          >
            {msg.author.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-[6px] mb-[2px]">
              <span className="text-[12px] font-semibold text-[var(--text-primary)]">{msg.author}</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">{msg.time}</span>
            </div>
            <div className="text-[12.5px] text-[var(--text-secondary)] leading-[1.4] truncate">
              {msg.text}
            </div>
          </div>
        </div>
      ))}
      {messages.length > 5 && (
        <button
          onClick={() => navigate('/nachrichten')}
          className="inline-flex items-center gap-[4px] text-[12px] text-[var(--accent)] font-medium mt-[10px] px-[6px] py-[4px] transition-opacity hover:underline"
        >
          Alle Nachrichten anzeigen →
        </button>
      )}
    </div>
  );
}

function FileIcon({ type }: { type: FileItem['type'] }) {
  const configs = {
    pdf: { bg: '#FEE2E2', color: '#DC2626', Icon: FileText },
    img: { bg: '#DBEAFE', color: '#2563EB', Icon: Image },
    jpg: { bg: '#DBEAFE', color: '#2563EB', Icon: Image },
    png: { bg: '#DBEAFE', color: '#2563EB', Icon: Image },
    svg: { bg: '#EDE9FE', color: '#7C3AED', Icon: File },
    doc: { bg: '#F0FDF4', color: '#16A34A', Icon: FileText },
  };
  const cfg = configs[type] ?? configs.doc;
  const Icon = cfg.Icon;
  return (
    <div
      className="w-[28px] h-[28px] rounded-[6px] flex items-center justify-center flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <Icon size={13} />
    </div>
  );
}
