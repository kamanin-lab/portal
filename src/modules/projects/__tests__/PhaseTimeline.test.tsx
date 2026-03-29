import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    // PhaseConnector renders a relative div with w-[28px] h-[2px] bg-[var(--border)]
    // For 4 chapters there should be 3 connectors. Query by the outer container class.
    const connectors = document.querySelectorAll('.relative.w-\\[28px\\].h-\\[2px\\]');
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

describe('TIMELINE-04: Mobile single-phase view', () => {
  beforeEach(() => {
    mockUseBreakpoint.mockReturnValue({ isMobile: true, isTablet: false, isDesktop: false, width: 375 });
  });

  afterEach(() => {
    mockUseBreakpoint.mockReturnValue({ isMobile: false, isTablet: false, isDesktop: true, width: 1200 });
  });

  test('shows only current chapter on mobile', () => {
    render(<PhaseTimeline project={makeProject()} />);
    // Chapter 2 "Struktur" is current — should be visible
    expect(screen.getByText('Struktur')).toBeInTheDocument();
    // Chapter 1 "Konzept" (completed) and Chapter 3 "Design" (upcoming) should NOT be visible
    expect(screen.queryByText('Konzept')).not.toBeInTheDocument();
    expect(screen.queryByText('Design')).not.toBeInTheDocument();
  });

  test('shows page indicator on mobile', () => {
    render(<PhaseTimeline project={makeProject()} />);
    // Current chapter is index 1 (Struktur), so indicator should be "2 / 4"
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
  });

  test('prev button has German aria-label', () => {
    render(<PhaseTimeline project={makeProject()} />);
    expect(screen.getByLabelText('Vorherige Phase')).toBeInTheDocument();
  });

  test('clicking next shows next chapter', () => {
    render(<PhaseTimeline project={makeProject()} />);
    const nextButton = screen.getByLabelText('Nächste Phase');
    fireEvent.click(nextButton);
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('3 / 4')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TIMELINE-05: Tooltip content
// ---------------------------------------------------------------------------

describe('TIMELINE-05: Tooltip content', () => {
  test('renders tooltip content with chapter.narrative', () => {
    const project = makeProject({
      chapters: [
        makeChapter({
          id: 'ch-1',
          title: 'Konzept',
          order: 1,
          narrative: 'Test narrative text',
          steps: [makeStep({ id: 'step-1-1', status: 'committed' })],
        }),
      ],
    });
    render(<PhaseTimeline project={project} />);
    // @radix-ui/react-tooltip mock renders Content directly, so narrative text is in DOM
    expect(screen.getByText('Test narrative text')).toBeInTheDocument();
  });
});
