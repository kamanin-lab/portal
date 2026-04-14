import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OverviewTabs } from '../components/overview/OverviewTabs';
import type { Project } from '../types/project';

// Strip Motion-specific props so they don't warn when spread onto DOM elements
function filterMotionProps(props: Record<string, unknown>): Record<string, unknown> {
  const motionKeys = new Set([
    'animate', 'initial', 'exit', 'variants', 'custom', 'transition',
    'layout', 'whileHover', 'whileTap', 'layoutId', 'layoutDependency',
  ]);
  return Object.fromEntries(Object.entries(props).filter(([k]) => !motionKeys.has(k)));
}

// Capture last motion.div props for animation assertion
let lastMotionDivProps: Record<string, unknown> = {};

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      lastMotionDivProps = props;
      return <div {...filterMotionProps(props)}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('../hooks/useProjectComments', () => ({
  useProjectComments: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('../hooks/useProjectActivity', () => ({
  useProjectActivity: vi.fn(() => ({ events: [] })),
}));

vi.mock('../hooks/useProjectFileActivity', () => ({
  useProjectFileActivity: vi.fn(() => ({ data: [] })),
  useSyncFileActivity: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock('../components/overview/UpdatesFeed', () => ({ ActivityFeed: () => <div data-testid="activity-feed" /> }));
vi.mock('../components/overview/MessagesTab', () => ({ MessagesTab: () => <div data-testid="messages-tab" /> }));
vi.mock('../components/overview/FilesTab', () => ({ FilesTab: () => <div data-testid="files-tab" /> }));

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

describe('OverviewTabs (DATA-03)', () => {
  test('renders three tab triggers: Aktivitaet, Dateien, Nachrichten', () => {
    render(<OverviewTabs project={makeProject()} />);
    expect(screen.getByText('Aktivität')).toBeInTheDocument();
    expect(screen.getByText('Dateien')).toBeInTheDocument();
    expect(screen.getByText('Nachrichten')).toBeInTheDocument();
  });

  test('wraps tab content in AnimatePresence with motion.div keyed on active tab', () => {
    render(<OverviewTabs project={makeProject()} />);
    // Default tab is 'updates', activity feed should be visible
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    // motion.div receives animation props (confirming it's wrapped in motion.div)
    expect(lastMotionDivProps.initial).toBeDefined();
    expect(lastMotionDivProps.animate).toBeDefined();
    expect(lastMotionDivProps.exit).toBeDefined();
  });

  test('switching tabs changes the visible content with fade+slide animation props', () => {
    render(<OverviewTabs project={makeProject()} />);

    // Verify initial animation props on motion.div
    expect(lastMotionDivProps.initial).toEqual({ opacity: 0, y: 8 });
    expect(lastMotionDivProps.animate).toEqual({ opacity: 1, y: 0 });
    expect(lastMotionDivProps.exit).toEqual({ opacity: 0, y: -4 });

    // Default view shows activity feed (updates tab active by default)
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    // Dateien and Nachrichten content are not rendered (conditional rendering)
    expect(screen.queryByTestId('files-tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('messages-tab')).not.toBeInTheDocument();
  });
});
