import { describe, test, vi } from 'vitest';
import React from 'react';

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('../../hooks/useProjectComments', () => ({
  useProjectComments: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('../../hooks/useProjectActivity', () => ({
  useProjectActivity: vi.fn(() => ({ events: [] })),
}));

vi.mock('../components/overview/UpdatesFeed', () => ({ ActivityFeed: () => <div data-testid="activity-feed" /> }));
vi.mock('../components/overview/MessagesTab', () => ({ MessagesTab: () => <div data-testid="messages-tab" /> }));
vi.mock('../components/overview/FilesTab', () => ({ FilesTab: () => <div data-testid="files-tab" /> }));

describe('OverviewTabs (DATA-03)', () => {
  test.todo('renders three tab triggers: Aktivitaet, Dateien, Nachrichten');
  test.todo('wraps tab content in AnimatePresence with motion.div keyed on active tab');
  test.todo('switching tabs changes the visible content with fade+slide animation props');
});
