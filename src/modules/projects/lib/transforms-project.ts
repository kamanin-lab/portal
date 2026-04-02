import type {
  Project, Chapter, Step, FileItem, Update,
  ProjectConfigRow, ChapterConfigRow, ProjectTaskCacheRow, StepEnrichmentRow,
  QuickActionConfigRow,
} from '../types/project';
import { mapStepStatus } from './step-status-mapping';

const PORTAL_CTA_FIELD_ID = 'f820ea20-fafc-4c72-9bf0-0903cbfc3b02';
const MILESTONE_ORDER_FIELD_NAME = 'milestone order';

type ClickUpCustomField = {
  id?: unknown;
  name?: unknown;
  value?: unknown;
};

type ClickUpRawTask = {
  custom_fields?: ClickUpCustomField[];
};

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

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return isoDate;
  }
}

function asRawTask(rawData: unknown): ClickUpRawTask | null {
  if (!rawData || typeof rawData !== 'object') return null;
  return rawData as ClickUpRawTask;
}

function getCustomFields(rawData: unknown): ClickUpCustomField[] {
  const rawTask = asRawTask(rawData);
  return Array.isArray(rawTask?.custom_fields) ? rawTask.custom_fields : [];
}

function getCustomFieldById(rawData: unknown, fieldId: string): ClickUpCustomField | null {
  return getCustomFields(rawData).find(field => field.id === fieldId) ?? null;
}

function getCustomFieldByName(rawData: unknown, fieldName: string): ClickUpCustomField | null {
  const normalizedName = fieldName.trim().toLowerCase();
  return getCustomFields(rawData).find(field => {
    return typeof field.name === 'string' && field.name.trim().toLowerCase() === normalizedName;
  }) ?? null;
}

export function parsePortalCta(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function parseMilestoneOrder(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractPortalCta(rawData: unknown): string | null {
  return parsePortalCta(getCustomFieldById(rawData, PORTAL_CTA_FIELD_ID)?.value);
}

function extractMilestoneOrder(rawData: unknown): number | null {
  return parseMilestoneOrder(getCustomFieldByName(rawData, MILESTONE_ORDER_FIELD_NAME)?.value);
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
  quickActionsConfig?: QuickActionConfigRow[],
): Project {
  const enrichmentMap = new Map<string, StepEnrichmentRow>();
  for (const e of enrichments) {
    enrichmentMap.set(e.clickup_task_id, e);
  }

  const tasksByChapter = new Map<string, ProjectTaskCacheRow[]>();
  for (const task of tasks) {
    if (!task.chapter_config_id) continue;
    const list = tasksByChapter.get(task.chapter_config_id) || [];
    list.push(task);
    tasksByChapter.set(task.chapter_config_id, list);
  }

  const sortedChapters = [...chapters].sort((a, b) => a.sort_order - b.sort_order);

  const projectChapters: Chapter[] = sortedChapters.map(ch => {
    const chapterTasks = tasksByChapter.get(ch.id) || [];

    chapterTasks.sort((a, b) => {
      const moA = extractMilestoneOrder(a.raw_data) ?? 999;
      const moB = extractMilestoneOrder(b.raw_data) ?? 999;
      if (moA !== moB) return moA - moB;
      const ea = enrichmentMap.get(a.clickup_id);
      const eb = enrichmentMap.get(b.clickup_id);
      const orderA = ea?.sort_order ?? 999;
      const orderB = eb?.sort_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    const steps: Step[] = chapterTasks.map(task => {
      const enrichment = enrichmentMap.get(task.clickup_id);
      const rawStatus = (task.status || '').trim();
      const stepStatus = mapStepStatus(rawStatus);
      const portalCta = extractPortalCta(task.raw_data);
      const milestoneOrder = extractMilestoneOrder(task.raw_data);

      const files: FileItem[] = (task.attachments || []).map(att => ({
        name: att.name,
        size: formatSize(att.size),
        date: formatDate(att.date) || '',
        type: detectFileType(att.name, att.type),
        author: '',
      }));

      return {
        id: task.clickup_id,
        clickupTaskId: task.clickup_id,
        title: task.name,
        status: stepStatus,
        rawStatus,
        portalCta,
        milestoneOrder,
        isClientReview: rawStatus.toLowerCase() === 'client review',
        updatedAt: formatDate(task.last_activity_at),
        taskIds: [],
        description: task.description || '',
        whyItMatters: enrichment?.why_it_matters || '',
        whatBecomesFixed: enrichment?.what_becomes_fixed || '',
        files,
        messages: [],
        commentCount: commentCounts[task.clickup_id] || 0,
      };
    });

    return {
      id: ch.id,
      title: ch.title,
      order: ch.sort_order,
      narrative: ch.narrative,
      nextNarrative: ch.next_narrative,
      clickupCfOptionId: ch.clickup_cf_option_id,
      steps,
    };
  });

  const allSteps = projectChapters.flatMap(ch => ch.steps);
  const needsAttention = allSteps.filter(s => s.status === 'awaiting_input').length;
  const inProgress = allSteps.filter(s => s.status === 'upcoming_locked').length;

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
      rawStatus: t.status,
      rawTimestamp: t.last_activity_at || undefined,
    }));

  return {
    id: config.id,
    name: config.name,
    type: config.type,
    client: config.client_name,
    clientInitials: config.client_initials,
    startDate: config.start_date || '',
    targetDate: config.target_date || '',
    clickupListId: config.clickup_list_id,
    clickupPhaseFieldId: config.clickup_phase_field_id,
    generalMessageTaskId: config.general_message_task_id ?? null,
    tasksSummary: {
      needsAttention,
      inProgress,
      total: allSteps.length,
    },
    updates,
    teamWorkingOn: {
      task: currentWork?.name || '',
      lastUpdate: currentWork?.last_activity_at
        ? formatDate(currentWork.last_activity_at) || ''
        : '',
    },
    chapters: projectChapters,
    quickActionsConfig: quickActionsConfig && quickActionsConfig.length > 0
      ? quickActionsConfig
      : undefined,
  };
}
