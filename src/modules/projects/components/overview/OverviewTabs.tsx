import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Image, File, MessageSquare } from 'lucide-react';
import type { Project, FileItem } from '../../types/project';
import { UpdatesFeed } from './UpdatesFeed';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { useProjectComments, type ProjectComment } from '../../hooks/useProjectComments';
import { linkifyText } from '@/shared/lib/linkify';

type Tab = 'updates' | 'dateien' | 'nachrichten';

interface OverviewTabsProps {
  project: Project;
  onOpenStep?: (stepId: string) => void;
}

export function OverviewTabs({ project: p, onOpenStep }: OverviewTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('updates');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'updates', label: 'Letzte Updates' },
    { id: 'dateien', label: 'Dateien' },
    { id: 'nachrichten', label: 'Nachrichten' },
  ];

  // Collect all files across all steps
  const allFiles: FileItem[] = p.chapters.flatMap(ch =>
    ch.steps.flatMap(s => s.files)
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
        {activeTab === 'updates' && (
          <UpdatesFeed updates={p.updates} project={p} onOpenStep={onOpenStep} />
        )}
        {activeTab === 'dateien' && <FilesTab files={allFiles} />}
        {activeTab === 'nachrichten' && <MessagesTab project={p} />}
      </div>
    </div>
  );
}

const PAGE_SIZE = 10;

function formatCommentTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'gerade eben';
    if (diffMin < 60) return `vor ${diffMin} Min.`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `vor ${diffHours} Std.`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `vor ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`;

    return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return isoDate;
  }
}

function MessagesTab({ project }: { project: Project }) {
  const { data: comments = [], isLoading } = useProjectComments(project);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (isLoading) {
    return <LoadingSkeleton lines={4} height="48px" />;
  }

  if (comments.length === 0) {
    return <EmptyState message="Noch keine Nachrichten." icon={<MessageSquare size={28} />} />;
  }

  const visible = comments.slice(0, visibleCount);
  const hasMore = visibleCount < comments.length;

  return (
    <div className="flex flex-col">
      {visible.map(comment => (
        <CommentFeedItem key={comment.id} comment={comment} />
      ))}
      {hasMore && (
        <button
          onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
          className="mt-[8px] px-[14px] py-[7px] text-[12.5px] font-medium text-[var(--text-secondary)] border border-[var(--border)] bg-white/60 rounded-[var(--r-sm)] self-center transition-all duration-150 hover:bg-white hover:border-[var(--text-tertiary)] cursor-pointer"
        >
          Mehr anzeigen
        </button>
      )}
    </div>
  );
}

function CommentFeedItem({ comment }: { comment: ProjectComment }) {
  const isTeam = !comment.isFromPortal;
  const initial = comment.authorName.charAt(0).toUpperCase();
  const avatarBg = isTeam ? 'var(--accent)' : '#7C3AED';
  const contextLabel = comment.chapterTitle
    ? `${comment.chapterTitle} \u2014 ${comment.stepTitle}`
    : comment.stepTitle;

  return (
    <div className="flex gap-[10px] px-[6px] py-[8px] rounded-[var(--r-sm)] transition-colors duration-[120ms] hover:bg-[var(--surface-hover)]">
      {/* Avatar */}
      <div
        className="w-[28px] h-[28px] rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: avatarBg, color: '#fff', fontSize: '10px', fontWeight: 700 }}
      >
        {initial}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
        {/* Header: name + time */}
        <div className="flex items-baseline gap-[6px]">
          <span className="text-[12px] font-semibold text-[var(--text-primary)]">
            {comment.authorName}
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap">
            {formatCommentTime(comment.createdAt)}
          </span>
        </div>

        {/* Comment text (truncated to ~2 lines) */}
        <p className="text-[12.5px] text-[var(--text-secondary)] leading-[1.4] line-clamp-2 break-words">
          {linkifyText(comment.text)}
        </p>

        {/* Step/chapter context tag */}
        <span className="text-[10px] text-[var(--text-tertiary)] mt-[1px] truncate">
          {contextLabel}
        </span>
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
