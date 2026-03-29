import { describe, test, expect } from 'vitest'
import { transformToProject } from '../lib/transforms-project'
import type {
  ProjectConfigRow,
  ChapterConfigRow,
  ProjectTaskCacheRow,
  StepEnrichmentRow,
} from '../types/project'

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
}

const chapters: ChapterConfigRow[] = [
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
  {
    id: 'chapter-1',
    project_config_id: 'project-1',
    clickup_cf_option_id: 'opt-1',
    title: 'Concept',
    sort_order: 1,
    narrative: 'Concept phase',
    next_narrative: 'Next after concept',
    is_active: true,
  },
]

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
    attachments: [
      { name: 'brief.pdf', url: 'https://example.com/brief.pdf', size: 1200, type: 'pdf', date: '2026-03-10T00:00:00Z' },
    ],
    raw_data: {
      custom_fields: [
        { id: 'f820ea20-fafc-4c72-9bf0-0903cbfc3b02', value: 'Jetzt freigeben' },
        { id: 'milestone-field', name: 'Milestone Order', value: '5' },
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
  {
    id: 'row-3',
    clickup_id: 'task-3',
    project_config_id: 'project-1',
    chapter_config_id: 'chapter-2',
    name: 'Homepage design',
    description: 'Design desc',
    status: 'to do',
    status_color: '#9ca3af',
    due_date: null,
    assignees: [],
    attachments: [],
    raw_data: {},
    is_visible: true,
    last_synced: '2026-03-09T00:00:00Z',
    last_activity_at: '2026-03-09T00:00:00Z',
  },
]

const enrichments: StepEnrichmentRow[] = [
  {
    id: 'enrich-1',
    clickup_task_id: 'task-2',
    why_it_matters: 'Clarifies navigation.',
    what_becomes_fixed: 'Structure is agreed.',
    sort_order: 1,
    content_hash: null,
    last_enriched_at: null,
  },
  {
    id: 'enrich-2',
    clickup_task_id: 'task-1',
    why_it_matters: 'Aligns expectations.',
    what_becomes_fixed: 'Workshop outcomes are fixed.',
    sort_order: 2,
    content_hash: null,
    last_enriched_at: null,
  },
]

describe('transformToProject', () => {
  test('sorts chapters by sort_order', () => {
    const project = transformToProject(config, chapters, tasks, enrichments, {})
    expect(project.chapters.map(ch => ch.id)).toEqual(['chapter-1', 'chapter-2'])
  })

  test('sorts chapter tasks by enrichment sort_order before name', () => {
    const project = transformToProject(config, chapters, tasks, enrichments, {})
    expect(project.chapters[0].steps.map(step => step.id)).toEqual(['task-2', 'task-1'])
  })

  test('merges enrichment fields into steps', () => {
    const project = transformToProject(config, chapters, tasks, enrichments, { 'task-2': 3 })
    const step = project.chapters[0].steps[0]
    expect(step.whyItMatters).toBe('Clarifies navigation.')
    expect(step.whatBecomesFixed).toBe('Structure is agreed.')
    expect(step.commentCount).toBe(3)
  })

  test('parses Portal CTA and Milestone Order from raw ClickUp custom fields', () => {
    const project = transformToProject(config, chapters, tasks, enrichments, {})
    const step = project.chapters[0].steps[1]
    expect(step.portalCta).toBe('Jetzt freigeben')
    expect(step.milestoneOrder).toBe(5)
    expect(step.isClientReview).toBe(true)
    expect(step.rawStatus).toBe('client review')
  })

  test('computes tasks summary from current mapped step status rules', () => {
    const project = transformToProject(config, chapters, tasks, enrichments, {})
    expect(project.tasksSummary.total).toBe(3)
    expect(project.tasksSummary.needsAttention).toBe(1)
    expect(project.tasksSummary.inProgress).toBe(2)
  })

  test('creates updates sorted by recent task activity', () => {
    const project = transformToProject(config, chapters, tasks, enrichments, {})
    expect(project.updates[0].text).toContain('Sitemap')
    expect(project.updates[1].text).toContain('Client workshop')
  })

  test('computes current teamWorkingOn from most recent active task', () => {
    const project = transformToProject(config, chapters, tasks, enrichments, {})
    expect(project.teamWorkingOn.task).toBe('Sitemap')
  })

  test('maps attachments into file items', () => {
    const project = transformToProject(config, chapters, tasks, enrichments, {})
    const file = project.chapters[0].steps[1].files[0]
    expect(file.name).toBe('brief.pdf')
    expect(file.type).toBe('pdf')
  })
})
