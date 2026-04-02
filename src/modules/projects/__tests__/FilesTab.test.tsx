import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilesTab } from '../components/overview/FilesTab';
import { slugify, buildChapterFolder } from '../lib/slugify';
import type { Project, Chapter, Step } from '../types/project';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseNextcloudFilesByPath = vi.fn();
vi.mock('../hooks/useNextcloudFiles', () => ({
  useNextcloudFiles: vi.fn(() => ({ files: [], notConfigured: false, isLoading: false, error: null, refetch: vi.fn() })),
  useNextcloudFilesByPath: (...args: unknown[]) => mockUseNextcloudFilesByPath(...args),
  useCreateFolder: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  downloadFile: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: 'step-1', clickupTaskId: 'cu-1', title: 'Test Step', status: 'committed',
    rawStatus: 'complete', milestoneOrder: 1, isClientReview: false,
    updatedAt: null, taskIds: [], description: '', whyItMatters: '', whatBecomesFixed: '',
    files: [], messages: [], commentCount: 0, ...overrides,
  };
}

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch-1', title: 'Konzept', order: 1, narrative: '', nextNarrative: '',
    clickupCfOptionId: null, steps: [makeStep()], ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1', name: 'Test Project', type: 'Website', client: 'Test Client',
    clientInitials: 'TC', startDate: '2026-01-01', targetDate: '2026-12-31',
    clickupListId: 'list-1', clickupPhaseFieldId: null, generalMessageTaskId: null,
    tasksSummary: { needsAttention: 0, inProgress: 0, total: 1 },
    updates: [], teamWorkingOn: { task: '', lastUpdate: '' },
    chapters: [
      makeChapter({ id: 'ch-1', title: 'Konzept', order: 1 }),
      makeChapter({ id: 'ch-2', title: 'Design', order: 2 }),
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FilesTab (FileBrowser → RootView) tests
// ---------------------------------------------------------------------------

describe('FilesTab', () => {
  beforeEach(() => {
    mockUseNextcloudFilesByPath.mockReset();
    mockUseNextcloudFilesByPath.mockReturnValue({
      files: [], notConfigured: false, isLoading: false, error: null, refetch: vi.fn(),
    });
  });

  test('renders folder names from Nextcloud root listing', () => {
    mockUseNextcloudFilesByPath.mockReturnValue({
      files: [
        { name: '01_konzept', path: '/root/01_konzept', type: 'folder', size: 0, lastModified: '' },
        { name: '02_design', path: '/root/02_design', type: 'folder', size: 0, lastModified: '' },
      ],
      notConfigured: false, isLoading: false, error: null, refetch: vi.fn(),
    });
    render(<FilesTab project={makeProject()} />);
    expect(screen.getByText('01_konzept')).toBeInTheDocument();
    expect(screen.getByText('02_design')).toBeInTheDocument();
  });

  test('shows not-configured message when Nextcloud is not set up', () => {
    mockUseNextcloudFilesByPath.mockReturnValue({
      files: [], notConfigured: true, isLoading: false, error: null, refetch: vi.fn(),
    });
    render(<FilesTab project={makeProject()} />);
    expect(screen.getByText('Dateien sind für dieses Projekt noch nicht konfiguriert.')).toBeInTheDocument();
  });

  test('shows empty message when no files or folders exist', () => {
    render(<FilesTab project={makeProject()} />);
    expect(screen.getByText('Noch keine Dateien in diesem Projekt.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// slugify utility tests
// ---------------------------------------------------------------------------

describe('slugify', () => {
  test('slugify("Moodboard & Design") returns "moodboard-design"', () => {
    expect(slugify('Moodboard & Design')).toBe('moodboard-design');
  });

  test('slugify("Ueber uns Seite") returns "ueber-uns-seite"', () => {
    expect(slugify('Ueber uns Seite')).toBe('ueber-uns-seite');
  });

  test('slugify("Übersicht") returns "uebersicht" (German umlaut ü → ue)', () => {
    expect(slugify('Übersicht')).toBe('uebersicht');
  });

  test('slugify("Konzept & Strategie") returns "konzept-strategie"', () => {
    expect(slugify('Konzept & Strategie')).toBe('konzept-strategie');
  });
});

// ---------------------------------------------------------------------------
// buildChapterFolder utility tests
// ---------------------------------------------------------------------------

describe('buildChapterFolder', () => {
  test('buildChapterFolder(1, "Konzept & Strategie") returns "01_konzept-strategie"', () => {
    expect(buildChapterFolder(1, 'Konzept & Strategie')).toBe('01_konzept-strategie');
  });

  test('buildChapterFolder(10, "Design") returns "10_design"', () => {
    expect(buildChapterFolder(10, 'Design')).toBe('10_design');
  });
});
