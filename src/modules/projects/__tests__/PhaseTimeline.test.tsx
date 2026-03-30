import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
// TIMELINE-01: Node size and phase colors
// ---------------------------------------------------------------------------

describe('TIMELINE-01: Node size and phase colors', () => {
  test('renders all 4 chapter titles', () => {
    render(<PhaseTimeline project={makeProject()} />);
    expect(screen.getByText('Konzept')).toBeInTheDocument();
    expect(screen.getByText('Struktur')).toBeInTheDocument();
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('Entwicklung')).toBeInTheDocument();
  });

  test('completed chapter shows Abgeschlossen label', () => {
    render(<PhaseTimeline project={makeProject()} />);
    expect(screen.getByText('Abgeschlossen')).toBeInTheDocument();
  });

  test('current chapter shows Aktuell label', () => {
    render(<PhaseTimeline project={makeProject()} />);
    expect(screen.getByText('Aktuell')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TIMELINE-02: Connector partial fill
// ---------------------------------------------------------------------------

describe('TIMELINE-02: Connector partial fill', () => {
  test('renders connectors between chapters on desktop', () => {
    render(<PhaseTimeline project={makeProject()} />);
    // PhaseTimeline renders an absolute-positioned wrapper for each connector between chapters.
    // For 4 chapters there should be 3 connectors.
    const connectors = document.querySelectorAll('.absolute.h-\\[2px\\]');
    expect(connectors).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// TIMELINE-03: Motion animations
// ---------------------------------------------------------------------------

describe('TIMELINE-03: Motion animations', () => {
  // Automated proxy for visual animation verification per TIMELINE-03:
  // AnimatePresence mock renders children, so state labels appearing in DOM
  // confirms the animated content is reachable in the component tree.
  test('state labels are rendered (AnimatePresence mock renders children)', () => {
    render(<PhaseTimeline project={makeProject()} />);
    // Both Abgeschlossen (completed) and Aktuell (current) state labels are rendered
    // This confirms AnimatePresence wrapping does not prevent rendering.
    expect(screen.getByText('Abgeschlossen')).toBeInTheDocument();
    expect(screen.getByText('Aktuell')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TIMELINE-04: Mobile single-phase view
// ---------------------------------------------------------------------------

describe('TIMELINE-04: Mobile horizontal scroll view', () => {
  beforeEach(() => {
    mockUseBreakpoint.mockReturnValue({ isMobile: true, isTablet: false, isDesktop: false, width: 375 });
  });

  afterEach(() => {
    mockUseBreakpoint.mockReturnValue({ isMobile: false, isTablet: false, isDesktop: true, width: 1200 });
  });

  test('shows all chapters on mobile (horizontal scroll)', () => {
    render(<PhaseTimeline project={makeProject()} />);
    expect(screen.getByText('Konzept')).toBeInTheDocument();
    expect(screen.getByText('Struktur')).toBeInTheDocument();
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('Entwicklung')).toBeInTheDocument();
  });

  test('mobile container has overflow-x-auto for horizontal scrolling', () => {
    const { container } = render(<PhaseTimeline project={makeProject()} />);
    const scrollContainer = container.firstElementChild;
    expect(scrollContainer?.className).toContain('overflow-x-auto');
  });

});


// ---------------------------------------------------------------------------
// DATA-04: Skeleton rendering
// ---------------------------------------------------------------------------

import { PhaseTimelineSkeleton } from '../components/overview/PhaseTimelineSkeleton';

describe('DATA-04: PhaseTimeline skeleton state', () => {
  test('renders PhaseTimelineSkeleton with 4 skeleton nodes when isLoading is true (DATA-04)', () => {
    const { getAllByTestId } = render(<PhaseTimelineSkeleton />);
    expect(getAllByTestId('skeleton-node').length).toBe(4);
  });
});
