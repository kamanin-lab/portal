import { describe, test, expect } from 'vitest';
import type { Chapter, Project, Step } from '../types/project';
import {
  getNextCheckpoint,
  getNextUpcomingStep,
  getCurrentChapter,
  isChapterCompleted,
  getChapterStatus,
  getChapterProgress,
  getPhaseColorForChapter,
  generateNarrative,
  getStepById,
  statusLabel,
} from '../lib/helpers';

// ─── Factories ──────────────────────────────────────────────────────────────

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: 'step-1',
    clickupTaskId: 'cu-1',
    title: 'Step One',
    status: 'upcoming_locked',
    rawStatus: 'to do',
    milestoneOrder: null,
    isClientReview: false,
    updatedAt: null,
    taskIds: [],
    description: '',
    whyItMatters: '',
    whatBecomesFixed: '',
    files: [],
    messages: [],
    commentCount: 0,
    ...overrides,
  };
}

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'chapter-1',
    title: 'Phase 1',
    order: 1,
    narrative: '',
    nextNarrative: '',
    clickupCfOptionId: null,
    steps: [],
    ...overrides,
  };
}

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
    tasksSummary: { needsAttention: 0, inProgress: 0, total: 0 },
    updates: [],
    teamWorkingOn: { task: '', lastUpdate: '' },
    chapters: [],
    ...overrides,
  };
}

// ─── getNextCheckpoint ───────────────────────────────────────────────────────

describe('getNextCheckpoint', () => {
  test('returns null when project has no chapters', () => {
    const p = makeProject({ chapters: [] });
    expect(getNextCheckpoint(p)).toBeNull();
  });

  test('returns null when all steps are committed or upcoming_locked', () => {
    const ch = makeChapter({
      steps: [makeStep({ status: 'committed' }), makeStep({ id: 'step-2', status: 'upcoming_locked' })],
    });
    expect(getNextCheckpoint(makeProject({ chapters: [ch] }))).toBeNull();
  });

  test('returns the first awaiting_input step with its chapter', () => {
    const s1 = makeStep({ id: 's1', status: 'committed' });
    const s2 = makeStep({ id: 's2', status: 'awaiting_input', title: 'Review needed' });
    const s3 = makeStep({ id: 's3', status: 'awaiting_input', title: 'Second review' });
    const ch = makeChapter({ steps: [s1, s2, s3] });
    const result = getNextCheckpoint(makeProject({ chapters: [ch] }));
    expect(result).not.toBeNull();
    expect(result!.step.id).toBe('s2');
    expect(result!.chapter.id).toBe('chapter-1');
  });

  test('scans chapters in order and returns first match across chapters', () => {
    const ch1 = makeChapter({ id: 'ch1', steps: [makeStep({ status: 'committed' })] });
    const ch2 = makeChapter({
      id: 'ch2',
      steps: [makeStep({ id: 'target', status: 'awaiting_input' })],
    });
    const result = getNextCheckpoint(makeProject({ chapters: [ch1, ch2] }));
    expect(result!.step.id).toBe('target');
    expect(result!.chapter.id).toBe('ch2');
  });
});

// ─── getNextUpcomingStep ─────────────────────────────────────────────────────

describe('getNextUpcomingStep', () => {
  test('returns null when no upcoming_locked step exists', () => {
    const ch = makeChapter({ steps: [makeStep({ status: 'committed' })] });
    expect(getNextUpcomingStep(makeProject({ chapters: [ch] }))).toBeNull();
  });

  test('returns the first upcoming_locked step with its chapter', () => {
    const s1 = makeStep({ id: 's1', status: 'awaiting_input' });
    const s2 = makeStep({ id: 's2', status: 'upcoming_locked' });
    const ch = makeChapter({ steps: [s1, s2] });
    const result = getNextUpcomingStep(makeProject({ chapters: [ch] }));
    expect(result!.step.id).toBe('s2');
  });
});

// ─── isChapterCompleted ──────────────────────────────────────────────────────

describe('isChapterCompleted', () => {
  test('returns true when all steps are committed', () => {
    const ch = makeChapter({
      steps: [
        makeStep({ status: 'committed' }),
        makeStep({ id: 's2', status: 'committed' }),
      ],
    });
    expect(isChapterCompleted(ch)).toBe(true);
  });

  test('returns false when any step is not committed', () => {
    const ch = makeChapter({
      steps: [
        makeStep({ status: 'committed' }),
        makeStep({ id: 's2', status: 'awaiting_input' }),
      ],
    });
    expect(isChapterCompleted(ch)).toBe(false);
  });

  test('returns true for chapter with no steps (vacuously true)', () => {
    expect(isChapterCompleted(makeChapter({ steps: [] }))).toBe(true);
  });
});

// ─── getCurrentChapter ───────────────────────────────────────────────────────

describe('getCurrentChapter', () => {
  test('returns null when project has no chapters', () => {
    expect(getCurrentChapter(makeProject({ chapters: [] }))).toBeNull();
  });

  test('returns chapter containing the first awaiting_input step', () => {
    const ch1 = makeChapter({ id: 'ch1', steps: [makeStep({ status: 'committed' })] });
    const ch2 = makeChapter({
      id: 'ch2',
      steps: [makeStep({ id: 's2', status: 'awaiting_input' })],
    });
    const result = getCurrentChapter(makeProject({ chapters: [ch1, ch2] }));
    expect(result!.id).toBe('ch2');
  });

  test('when no awaiting_input, returns first incomplete chapter', () => {
    const ch1 = makeChapter({ id: 'ch1', steps: [makeStep({ status: 'committed' })] });
    const ch2 = makeChapter({
      id: 'ch2',
      steps: [makeStep({ id: 's2', status: 'upcoming_locked' })],
    });
    const result = getCurrentChapter(makeProject({ chapters: [ch1, ch2] }));
    expect(result!.id).toBe('ch2');
  });

  test('when all chapters are complete, returns the last chapter', () => {
    const ch1 = makeChapter({ id: 'ch1', steps: [makeStep({ status: 'committed' })] });
    const ch2 = makeChapter({ id: 'ch2', steps: [makeStep({ id: 's2', status: 'committed' })] });
    const result = getCurrentChapter(makeProject({ chapters: [ch1, ch2] }));
    expect(result!.id).toBe('ch2');
  });
});

// ─── getChapterStatus ────────────────────────────────────────────────────────

describe('getChapterStatus', () => {
  test('returns "completed" when chapter is fully committed', () => {
    const ch = makeChapter({ steps: [makeStep({ status: 'committed' })] });
    const p = makeProject({ chapters: [ch] });
    expect(getChapterStatus(ch, p)).toBe('completed');
  });

  test('returns "current" for the active chapter (has awaiting_input)', () => {
    const ch1 = makeChapter({ id: 'ch1', steps: [makeStep({ status: 'committed' })] });
    const ch2 = makeChapter({
      id: 'ch2',
      steps: [makeStep({ id: 's2', status: 'awaiting_input' })],
    });
    const p = makeProject({ chapters: [ch1, ch2] });
    expect(getChapterStatus(ch2, p)).toBe('current');
  });

  test('returns "upcoming" for a future locked chapter', () => {
    const ch1 = makeChapter({
      id: 'ch1',
      steps: [makeStep({ status: 'awaiting_input' })],
    });
    const ch2 = makeChapter({
      id: 'ch2',
      steps: [makeStep({ id: 's2', status: 'upcoming_locked' })],
    });
    const p = makeProject({ chapters: [ch1, ch2] });
    expect(getChapterStatus(ch2, p)).toBe('upcoming');
  });
});

// ─── getChapterProgress ──────────────────────────────────────────────────────

describe('getChapterProgress', () => {
  test('returns "0/0" for an empty chapter', () => {
    expect(getChapterProgress(makeChapter({ steps: [] }))).toBe('0/0');
  });

  test('counts only committed steps in numerator', () => {
    const ch = makeChapter({
      steps: [
        makeStep({ status: 'committed' }),
        makeStep({ id: 's2', status: 'awaiting_input' }),
        makeStep({ id: 's3', status: 'upcoming_locked' }),
      ],
    });
    expect(getChapterProgress(ch)).toBe('1/3');
  });

  test('shows full completion', () => {
    const ch = makeChapter({
      steps: [makeStep({ status: 'committed' }), makeStep({ id: 's2', status: 'committed' })],
    });
    expect(getChapterProgress(ch)).toBe('2/2');
  });
});

// ─── getPhaseColorForChapter ─────────────────────────────────────────────────

describe('getPhaseColorForChapter', () => {
  test('returns color for chapter order 1', () => {
    const ch = makeChapter({ order: 1 });
    const color = getPhaseColorForChapter(ch);
    expect(color.main).toBe('#7C3AED');
  });

  test('returns color for chapter order 2', () => {
    const ch = makeChapter({ order: 2 });
    const color = getPhaseColorForChapter(ch);
    expect(color.main).toBe('#2563EB');
  });

  test('falls back to order-1 color for unknown order', () => {
    const ch = makeChapter({ order: 99 });
    const color = getPhaseColorForChapter(ch);
    expect(color.main).toBe('#7C3AED');
  });
});

// ─── getStepById ─────────────────────────────────────────────────────────────

describe('getStepById', () => {
  test('returns null when step id does not exist', () => {
    const p = makeProject({ chapters: [makeChapter({ steps: [makeStep()] })] });
    expect(getStepById('nonexistent', p)).toBeNull();
  });

  test('returns step and its chapter when found', () => {
    const s = makeStep({ id: 'target-step', title: 'Found it' });
    const ch = makeChapter({ id: 'parent-chapter', steps: [s] });
    const p = makeProject({ chapters: [ch] });
    const result = getStepById('target-step', p);
    expect(result).not.toBeNull();
    expect(result!.step.id).toBe('target-step');
    expect(result!.chapter.id).toBe('parent-chapter');
  });

  test('finds step in the second chapter', () => {
    const ch1 = makeChapter({ id: 'ch1', steps: [makeStep({ id: 'other' })] });
    const ch2 = makeChapter({ id: 'ch2', steps: [makeStep({ id: 'deep' })] });
    const result = getStepById('deep', makeProject({ chapters: [ch1, ch2] }));
    expect(result!.chapter.id).toBe('ch2');
  });
});

// ─── statusLabel ─────────────────────────────────────────────────────────────

describe('statusLabel', () => {
  test.each([
    ['committed', 'Bestätigt'],
    ['awaiting_input', 'Wartet auf Sie'],
    ['upcoming_locked', 'Bald'],
  ] as const)('maps %s → %s', (status, expected) => {
    expect(statusLabel(status)).toBe(expected);
  });

  test('returns the raw string for unknown status values', () => {
    // @ts-expect-error intentional unknown value
    expect(statusLabel('unknown_status')).toBe('unknown_status');
  });
});

// ─── generateNarrative ───────────────────────────────────────────────────────

describe('generateNarrative', () => {
  test('returns special first-checkpoint narrative when nothing is completed yet', () => {
    const ch = makeChapter({
      steps: [makeStep({ status: 'awaiting_input' })],
    });
    const p = makeProject({ chapters: [ch] });
    const text = generateNarrative(p);
    expect(text).toContain('Anforderungen');
    expect(text).toContain('Scope');
  });

  test('includes completed chapter titles in narrative', () => {
    const completed = makeChapter({
      id: 'ch1',
      title: 'Planung',
      steps: [makeStep({ status: 'committed' })],
    });
    const current = makeChapter({
      id: 'ch2',
      title: 'Design',
      steps: [makeStep({ id: 's2', status: 'awaiting_input', title: 'Mock-ups freigeben' })],
    });
    const p = makeProject({ chapters: [completed, current] });
    const text = generateNarrative(p);
    expect(text).toContain('Planung');
    expect(text).toContain('Mock-ups freigeben');
  });

  test('mentions next chapter when current is not the last', () => {
    const ch1 = makeChapter({
      id: 'ch1',
      title: 'Planung',
      steps: [makeStep({ status: 'committed' })],
    });
    const ch2 = makeChapter({
      id: 'ch2',
      title: 'Design',
      steps: [makeStep({ id: 's2', status: 'awaiting_input' })],
    });
    const ch3 = makeChapter({ id: 'ch3', title: 'Entwicklung', steps: [] });
    const text = generateNarrative(makeProject({ chapters: [ch1, ch2, ch3] }));
    expect(text).toContain('Entwicklung');
  });

  test('says approaching end when current is the last chapter', () => {
    const ch1 = makeChapter({
      id: 'ch1',
      title: 'Planung',
      steps: [makeStep({ status: 'committed' })],
    });
    const ch2 = makeChapter({
      id: 'ch2',
      title: 'Abschluss',
      steps: [makeStep({ id: 's2', status: 'awaiting_input' })],
    });
    const text = generateNarrative(makeProject({ chapters: [ch1, ch2] }));
    expect(text).toContain('nähern');
  });
});
