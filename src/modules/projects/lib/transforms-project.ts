import type {
  Project, Chapter, Step, FileItem, Update, ProjectTask,
  ProjectConfigRow, ChapterConfigRow, ProjectTaskCacheRow, StepEnrichmentRow,
} from '../types/project';
import { mapStepStatus } from './step-status-mapping';

// File type detection from extension or MIME type
function detectFileType(name: string, type: string): FileItem['type'] {
  const ext = name.split('.').pop()?.toLowerCase() || type.toLowerCase();
  if (['pdf'].includes(ext)) return 'pdf';
  if (['jpg', 'jpeg'].includes(ext) || ext.startsWith('image/jpeg')) return 'jpg';
  if (['png'].includes(ext) || ext.startsWith('image/png')) return 'png';
  if (['svg'].includes(ext) || ext.startsWith('image/svg')) return 'svg';
  if (['doc', 'docx'].includes(ext)) return 'doc';
  if (ext.startsWith('image/')) return 'img';
  return 'doc';
}

// Format bytes to human-readable
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Format ISO date to German short format
function formatDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return isoDate;
  }
}

/**
 * Transform database rows into the Project type consumed by all UI components.
 */
export function transformToProject(
  config: ProjectConfigRow,
  chapters: ChapterConfigRow[],
  tasks: ProjectTaskCacheRow[],
  enrichments: StepEnrichmentRow[],
  commentCounts: Record<string, number>,
): Project {
  // Build enrichment lookup
  const enrichmentMap = new Map<string, StepEnrichmentRow>();
  for (const e of enrichments) {
    enrichmentMap.set(e.clickup_task_id, e);
  }

  // Group tasks by chapter_config_id
  const tasksByChapter = new Map<string, ProjectTaskCacheRow[]>();
  const unassignedTasks: ProjectTaskCacheRow[] = [];
  for (const task of tasks) {
    if (task.chapter_config_id) {
      const list = tasksByChapter.get(task.chapter_config_id) || [];
      list.push(task);
      tasksByChapter.set(task.chapter_config_id, list);
    } else {
      unassignedTasks.push(task);
    }
  }

  // Sort chapters by sort_order
  const sortedChapters = [...chapters].sort((a, b) => a.sort_order - b.sort_order);

  // Build chapters with steps
  const projectChapters: Chapter[] = sortedChapters.map(ch => {
    const chapterTasks = tasksByChapter.get(ch.id) || [];

    // Sort tasks by enrichment sort_order, then by name
    chapterTasks.sort((a, b) => {
      const ea = enrichmentMap.get(a.clickup_id);
      const eb = enrichmentMap.get(b.clickup_id);
      const orderA = ea?.sort_order ?? 999;
      const orderB = eb?.sort_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    const steps: Step[] = chapterTasks.map(task => {
      const enrichment = enrichmentMap.get(task.clickup_id);
      const stepStatus = mapStepStatus(task.status);

      const files: FileItem[] = (task.attachments || []).map(att => ({
        name: att.name,
        size: formatSize(att.size),
        date: formatDate(att.date) || '',
        type: detectFileType(att.name, att.type),
        author: '', // ClickUp attachments don't include uploader name
      }));

      return {
        id: task.clickup_id,
        clickupTaskId: task.clickup_id,
        title: task.name,
        status: stepStatus,
        updatedAt: formatDate(task.last_activity_at),
        taskIds: [], // ProjectTasks (sub-items) not used in live data
        description: task.description || '',
        whyItMatters: enrichment?.why_it_matters || '',
        whatBecomesFixed: enrichment?.what_becomes_fixed || '',
        files,
        messages: [], // Live comments loaded on-demand via useTaskComments in Phase 4
        commentCount: commentCounts[task.clickup_id] || 0,
      };
    });

    return {
      id: ch.id,
      title: ch.title,
      order: ch.sort_order,
      narrative: ch.narrative,
      nextNarrative: ch.next_narrative,
      steps,
    };
  });

  // Compute tasksSummary from step statuses
  const allSteps = projectChapters.flatMap(ch => ch.steps);
  const needsAttention = allSteps.filter(s => s.status === 'awaiting_input').length;
  const inProgress = allSteps.filter(s => s.status === 'upcoming_locked').length;

  // Compute teamWorkingOn from most recently active non-review task
  const inProgressTasks = tasks
    .filter(t => {
      const s = t.status.toLowerCase();
      return s === 'in progress' || s === 'internal review' || s === 'rework';
    })
    .sort((a, b) => {
      const da = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
      const db = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
      return db - da;
    });

  const currentWork = inProgressTasks[0];

  // Build updates from recent task activity
  const updates: Update[] = tasks
    .filter(t => t.last_activity_at)
    .sort((a, b) => {
      const da = new Date(a.last_activity_at || 0).getTime();
      const db = new Date(b.last_activity_at || 0).getTime();
      return db - da;
    })
    .slice(0, 10)
    .map(t => ({
      text: `${t.name} — ${t.status}`,
      time: formatDate(t.last_activity_at) || '',
      type: 'status' as const,
    }));

  return {
    id: config.id,
    name: config.name,
    type: config.type,
    client: config.client_name,
    clientInitials: config.client_initials,
    startDate: config.start_date || '',
    targetDate: config.target_date || '',
    tasksSummary: {
      needsAttention,
      inProgress,
      total: allSteps.length,
    },
    tasks: [] as ProjectTask[], // Not used in live data (sub-tasks not mapped)
    updates,
    teamWorkingOn: {
      task: currentWork?.name || '',
      eta: '',
      lastUpdate: currentWork?.last_activity_at
        ? formatDate(currentWork.last_activity_at) || ''
        : '',
    },
    chapters: projectChapters,
  };
}
