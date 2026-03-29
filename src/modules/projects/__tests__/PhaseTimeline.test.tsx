import { describe, test, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PhaseTimeline } from '../components/overview/PhaseTimeline';
import type { Project, Chapter, Step } from '../types/project';

// Mock useBreakpoint -- default to desktop
const mockUseBreakpoint = vi.fn(() => ({ isMobile: false, isTablet: false, isDesktop: true, width: 1200 }));
vi.mock('@/shared/hooks/useBreakpoint', () => ({
  useBreakpoint: () => mockUseBreakpoint(),
}));

// Strip Motion-specific props so they don't warn when spread onto DOM elements
function filterMotionProps(props: Record<string, unknown>): Record<string, unknown> {
  const motionKeys = new Set([
    'animate', 'initial', 'exit', 'variants', 'custom', 'transition',
    'layout', 'whileHover', 'whileTap', 'layoutId', 'layoutDependency',
  ]);
  return Object.fromEntries(Object.entries(props).filter(([k]) => !motionKeys.has(k)));
}

// Mock motion/react -- render children without animation in jsdom
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...filterMotionProps(props)}>{children}</div>
    ),
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span {...filterMotionProps(props)}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Mock @radix-ui/react-tooltip -- render children directly
vi.mock('@radix-ui/react-tooltip', () => ({
  Provider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Root: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Trigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Content: ({ children }: React.PropsWithChildren) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  Portal: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: 'step-1',
    clickupTaskId: 'cu-1',
    title: 'Test Step',
    status: 'committed',
    rawStatus: 'complete',
    portalCta: null,
    milestoneOrder: 1,
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
    id: 'ch-1',
    title: 'Test Chapter',
    order: 1,
    narrative: '',
    nextNarrative: '',
    clickupCfOptionId: null,
    steps: [makeStep()],
    ...overrides,
  };
}

/**
 * Creates a Project with 4 chapters:
 * - Chapter 1 "Konzept" (order 1): 2 steps both 'committed' → completed
 * - Chapter 2 "Struktur" (order 2): 1 step 'awaiting_input' + 1 step 'upcoming_locked' → current
 * - Chapter 3 "Design" (order 3): 1 step 'upcoming_locked' → upcoming
 * - Chapter 4 "Entwicklung" (order 4): 1 step 'upcoming_locked' → upcoming
 */
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
    chapters: [
      makeChapter({
        id: 'ch-1',
        title: 'Konzept',
        order: 1,
        steps: [
          makeStep({ id: 'step-1-1', status: 'committed' }),
          makeStep({ id: 'step-1-2', status: 'committed' }),
        ],
      }),
      makeChapter({
        id: 'ch-2',
        title: 'Struktur',
        order: 2,
        steps: [
          makeStep({ id: 'step-2-1', status: 'awaiting_input' }),
          makeStep({ id: 'step-2-2', status: 'upcoming_locked' }),
        ],
      }),
      makeChapter({
        id: 'ch-3',
        title: 'Design',
        order: 3,
        steps: [
          makeStep({ id: 'step-3-1', status: 'upcoming_locked' }),
        ],
      }),
      makeChapter({
        id: 'ch-4',
        title: 'Entwicklung',
        order: 4,
        steps: [
          makeStep({ id: 'step-4-1', status: 'upcoming_locked' }),
        ],
      }),
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test helper: silence render calls in todo-only suites
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _render = render;

// ---------------------------------------------------------------------------
// TIMELINE-01: Node size and phase colors
// ---------------------------------------------------------------------------

describe('TIMELINE-01: Node size and phase colors', () => {
  test.todo('renders all 4 chapter titles');
  test.todo('completed chapter shows Abgeschlossen label');
  test.todo('current chapter shows Aktuell label');
});

// ---------------------------------------------------------------------------
// TIMELINE-02: Connector partial fill
// ---------------------------------------------------------------------------

describe('TIMELINE-02: Connector partial fill', () => {
  test.todo('renders connectors between chapters on desktop');
});

// ---------------------------------------------------------------------------
// TIMELINE-03: Motion animations
// ---------------------------------------------------------------------------

describe('TIMELINE-03: Motion animations', () => {
  // Automated proxy for visual animation verification per TIMELINE-03:
  // AnimatePresence mock renders children, so state labels appearing in DOM
  // confirms the animated content is reachable in the component tree.
  test.todo('state labels are rendered (AnimatePresence mock renders children)');
});

// ---------------------------------------------------------------------------
// TIMELINE-04: Mobile single-phase view
// ---------------------------------------------------------------------------

describe('TIMELINE-04: Mobile single-phase view', () => {
  test.todo('shows only current chapter on mobile');
  test.todo('shows page indicator on mobile');
  test.todo('prev button has German aria-label');
  test.todo('clicking next shows next chapter');
});

// ---------------------------------------------------------------------------
// TIMELINE-05: Tooltip content
// ---------------------------------------------------------------------------

describe('TIMELINE-05: Tooltip content', () => {
  test.todo('renders tooltip content with chapter.narrative');
});
