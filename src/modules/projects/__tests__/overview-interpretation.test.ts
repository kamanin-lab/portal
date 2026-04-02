import { describe, expect, test } from 'vitest';
import { transformToProject } from '../lib/transforms-project';
import { interpretProjectOverview } from '../lib/overview-interpretation';
import type {
  ChapterConfigRow,
  ProjectConfigRow,
  ProjectTaskCacheRow,
  StepEnrichmentRow,
} from '../types/project';

const config: ProjectConfigRow = {
  id: 'project-1',
  clickup_list_id: 'list-1',
  clickup_phase_field_id: 'phase-field-1',
  name: 'Portal Relaunch',
  type: 'Website',
  client_name: 'MBM',
  client_initials: 'MB',
  start_date: '2026-03-01',
  target_date: '2026-06-01',
  is_active: true,
  general_message_task_id: null,
};

const chapters: ChapterConfigRow[] = [
  {
    id: 'chapter-1',
    project_config_id: 'project-1',
    clickup_cf_option_id: 'opt-1',
    title: 'Concept',
    sort_order: 1,
    narrative: 'Concept phase in progress',
    next_narrative: 'Next after concept',
    is_active: true,
  },
  {
    id: 'chapter-2',
    project_config_id: 'project-1',
    clickup_cf_option_id: 'opt-2',
    title: 'Design',
    sort_order: 2,
    narrative: 'Design phase',
    next_narrative: 'Next after design',
    is_active: true,
  },
];

const tasks: ProjectTaskCacheRow[] = [
  {
    id: 'row-1',
    clickup_id: 'task-1',
    project_config_id: 'project-1',
    chapter_config_id: 'chapter-1',
    name: 'Client workshop',
    description: 'Workshop desc',
    status: 'client review',
    status_color: '#f59e0b',
    due_date: null,
    assignees: [],
    attachments: [],
    raw_data: {
      custom_fields: [
        { id: 'milestone-field', name: 'Milestone Order', value: 2 },
      ],
    },
    is_visible: true,
    last_synced: '2026-03-10T00:00:00Z',
    last_activity_at: '2026-03-10T00:00:00Z',
  },
  {
    id: 'row-2',
    clickup_id: 'task-2',
    project_config_id: 'project-1',
    chapter_config_id: 'chapter-1',
    name: 'Sitemap',
    description: 'Sitemap desc',
    status: 'in progress',
    status_color: '#2563eb',
    due_date: null,
    assignees: [],
    attachments: [],
    raw_data: {},
    is_visible: true,
    last_synced: '2026-03-11T00:00:00Z',
    last_activity_at: '2026-03-11T00:00:00Z',
  },
];

const enrichments: StepEnrichmentRow[] = [
  {
    id: 'enrich-1',
    clickup_task_id: 'task-1',
    why_it_matters: 'Aligns expectations.',
    what_becomes_fixed: 'Workshop outcomes are fixed.',
    sort_order: 1,
    content_hash: null,
    last_enriched_at: null,
  },
];

describe('interpretProjectOverview', () => {
  test('surfaces awaiting client review as primary attention', () => {
    const project = transformToProject(config, chapters, tasks, enrichments, {});
    const overview = interpretProjectOverview(project);

    expect(overview.primaryAttention?.stepId).toBe('task-1');
    expect(overview.primaryAttention?.whyItMatters).toBe('Aligns expectations.');
    expect(overview.currentStateTitle).toContain('Concept');
    expect(overview.quickActions[0].destinationKind).toBe('primary_cta');
  });

  test('sorts attention items by milestone order ascending', () => {
    const project = transformToProject(
      config,
      chapters,
      [
        ...tasks,
        {
          id: 'row-3',
          clickup_id: 'task-3',
          project_config_id: 'project-1',
          chapter_config_id: 'chapter-2',
          name: 'UI approval',
          description: 'UI approval desc',
          status: 'client review',
          status_color: '#f59e0b',
          due_date: null,
          assignees: [],
          attachments: [],
          raw_data: {
            custom_fields: [
              { id: 'milestone-field', name: 'Milestone Order', value: 99 },
            ],
          },
          is_visible: true,
          last_synced: '2026-03-12T00:00:00Z',
          last_activity_at: '2026-03-12T00:00:00Z',
        },
      ],
      enrichments,
      {},
    );

    const overview = interpretProjectOverview(project);

    // task-1 has milestoneOrder 5, task-3 has 99 → task-1 is primary
    expect(overview.primaryAttention?.stepId).toBe('task-1');
    expect(overview.attentionList).toHaveLength(2);
    expect(overview.attentionList[1].stepId).toBe('task-3');
  });

  test('falls back to no client action when no checkpoint exists', () => {
    const cleanTasks = tasks.map(task => ({
      ...task,
      status: task.clickup_id === 'task-1' ? 'approved' : task.status,
    }));

    const project = transformToProject(config, chapters, cleanTasks, enrichments, {});
    const overview = interpretProjectOverview(project);

    expect(overview.primaryAttention).toBeNull();
    expect(overview.attentionList).toEqual([]);
    expect(overview.waitingOnTeamSummary).toContain('Sitemap');
    expect(overview.quickActions).toEqual([]);
  });

  test('keeps current phase on the earliest incomplete chapter when later chapters are still upcoming', () => {
    const noCheckpointTasks: ProjectTaskCacheRow[] = [
      {
        ...tasks[0],
        status: 'approved',
      },
      {
        ...tasks[1],
        status: 'in progress',
      },
      {
        id: 'row-3',
        clickup_id: 'task-3',
        project_config_id: 'project-1',
        chapter_config_id: 'chapter-2',
        name: 'UI concepts',
        description: 'UI concept work',
        status: 'open',
        status_color: '#94a3b8',
        due_date: null,
        assignees: [],
        attachments: [],
        raw_data: {},
        is_visible: true,
        last_synced: '2026-03-12T00:00:00Z',
        last_activity_at: '2026-03-09T00:00:00Z',
      },
    ];

    const project = transformToProject(config, chapters, noCheckpointTasks, enrichments, {});
    const overview = interpretProjectOverview(project);

    expect(overview.currentCheckpoint).toBeNull();
    expect(overview.currentChapter?.title).toBe('Concept');
    expect(overview.currentStateTitle).toContain('Concept');
    expect(overview.currentStateTitle).not.toContain('Design');
    expect(overview.nextMeaningfulStep?.step.id).toBe('task-2');
    expect(overview.nextMeaningfulStep?.chapter.title).toBe('Concept');
    expect(overview.currentStateDescription).toContain('Concept phase in progress');
  });
});
