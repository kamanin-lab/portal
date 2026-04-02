import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DynamicHero } from '../components/overview/DynamicHero';
import type { Project } from '../types/project';
import type { InterpretedProjectOverview } from '../lib/overview-interpretation';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Minimal Project mock — only fields used by DynamicHero
function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Test Project',
    type: 'Website',
    client: 'Test Client',
    clientInitials: 'TC',
    startDate: '2026-01-01',
    targetDate: '2026-12-31',
    clickupListId: 'list-1',
    clickupPhaseFieldId: null,
    generalMessageTaskId: null,
    tasksSummary: { needsAttention: 0, inProgress: 0, total: 5 },
    updates: [],
    teamWorkingOn: { task: '', lastUpdate: '' },
    chapters: [],
    ...overrides,
  };
}

// Minimal InterpretedProjectOverview mock
function makeOverview(overrides: Partial<InterpretedProjectOverview> = {}): InterpretedProjectOverview {
  return {
    currentChapter: null,
    currentCheckpoint: null,
    nextMeaningfulStep: null,
    currentStateTitle: '',
    currentStateDescription: '',
    waitingOnTeamSummary: '',
    nextStepSummary: '',
    topUpdates: [],
    primaryAttention: null,
    attentionList: [],
    quickActions: [],
    ...overrides,
  };
}

describe('DynamicHero — P1 priority (primaryAttention)', () => {
  test('renders whyItMatters when non-empty (not raw description)', () => {
    const overview = makeOverview({
      primaryAttention: {
        stepId: 'step-1',
        chapterId: 'ch-1',
        chapterTitle: 'Konzept',
        title: 'Workshop Ergebnisse',
        description: 'raw clickup desc',
        whyItMatters: 'AI enrichment text',
        whatBecomesFixed: 'Structure is agreed.',
        lastUpdated: null,

        milestoneOrder: 1,
        isPrimary: true,
      },
    });

    render(<DynamicHero project={makeProject()} overview={overview} />);

    expect(screen.getByText('AI enrichment text')).toBeInTheDocument();
    expect(screen.queryByText('raw clickup desc')).not.toBeInTheDocument();
  });

  test('renders description fallback when whyItMatters is empty string', () => {
    const overview = makeOverview({
      primaryAttention: {
        stepId: 'step-1',
        chapterId: 'ch-1',
        chapterTitle: 'Konzept',
        title: 'Workshop Ergebnisse',
        description: 'raw clickup desc',
        whyItMatters: '',
        whatBecomesFixed: 'Structure is agreed.',
        lastUpdated: null,

        milestoneOrder: 1,
        isPrimary: true,
      },
    });

    render(<DynamicHero project={makeProject()} overview={overview} />);

    expect(screen.getByText('raw clickup desc')).toBeInTheDocument();
  });
});

describe('DynamicHero — P3 priority (upcomingStep)', () => {
  const makeUpcomingOverview = (whyItMatters: string): InterpretedProjectOverview => {
    const step = {
      id: 'step-2',
      clickupTaskId: 'cu-2',
      title: 'Design Mockups',
      status: 'upcoming_locked' as const,
      rawStatus: 'to do',

      milestoneOrder: 2,
      isClientReview: false,
      updatedAt: null,
      taskIds: [],
      description: 'raw clickup desc',
      whyItMatters,
      whatBecomesFixed: 'Design direction is locked.',
      files: [],
      messages: [],
      commentCount: 0,
    };

    const chapter = {
      id: 'ch-2',
      title: 'Design',
      order: 2,
      narrative: '',
      nextNarrative: '',
      clickupCfOptionId: null,
      steps: [step],
    };

    return makeOverview({
      primaryAttention: null,
      nextMeaningfulStep: { step, chapter },
    });
  };

  test('renders whyItMatters when non-empty for P3 upcoming step', () => {
    const project = makeProject({ tasksSummary: { needsAttention: 0, inProgress: 0, total: 5 } });
    const overview = makeUpcomingOverview('AI enrichment text');

    render(<DynamicHero project={project} overview={overview} />);

    expect(screen.getByText('AI enrichment text')).toBeInTheDocument();
    expect(screen.queryByText('raw clickup desc')).not.toBeInTheDocument();
  });

  test('renders description fallback when whyItMatters is empty for P3 upcoming step', () => {
    const project = makeProject({ tasksSummary: { needsAttention: 0, inProgress: 0, total: 5 } });
    const overview = makeUpcomingOverview('');

    render(<DynamicHero project={project} overview={overview} />);

    expect(screen.getByText('raw clickup desc')).toBeInTheDocument();
  });
});
