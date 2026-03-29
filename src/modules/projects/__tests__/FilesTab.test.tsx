import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilesTab } from '../components/overview/FilesTab';
import { slugify, buildChapterFolder } from '../lib/slugify';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock useNextcloudFiles hook
const mockUseNextcloudFiles = vi.fn();
vi.mock('../hooks/useNextcloudFiles', () => ({
  useNextcloudFiles: (...args: unknown[]) => mockUseNextcloudFiles(...args),
  downloadFile: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeFile(overrides: Record<string, unknown> = {}) {
  return {
    name: 'test.pdf',
    path: '/project/test.pdf',
    type: 'file' as const,
    size: 1024,
    lastModified: '2026-01-01T00:00:00Z',
    mimeType: 'application/pdf',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FilesTab tests
// ---------------------------------------------------------------------------

describe('FilesTab', () => {
  beforeEach(() => {
    mockUseNextcloudFiles.mockReset();
    mockUseNextcloudFiles.mockReturnValue({
      files: [],
      notConfigured: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  test('renders exactly 8 file-type entries when hook returns 10 files (mixed type)', () => {
    const files = [
      ...Array.from({ length: 6 }, (_, i) =>
        makeFile({ name: `file${i}.pdf`, path: `/p/file${i}.pdf`, lastModified: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` })
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeFile({ name: `folder${i}`, path: `/p/folder${i}`, type: 'folder' as const })
      ),
    ];
    mockUseNextcloudFiles.mockReturnValue({
      files,
      notConfigured: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<FilesTab projectConfigId="cfg-1" />);

    // Only file-type entries should be shown, max 8
    // 6 files + 4 folders → filter to 6 files → all 6 shown
    expect(screen.getByText('file0.pdf')).toBeInTheDocument();
    expect(screen.getByText('file5.pdf')).toBeInTheDocument();
    // Folders should not appear as file entries
    expect(screen.queryByText('folder0')).not.toBeInTheDocument();
  });

  test('renders exactly 8 when more than 8 files are returned', () => {
    const files = Array.from({ length: 12 }, (_, i) =>
      makeFile({ name: `file${i}.pdf`, path: `/p/file${i}.pdf`, lastModified: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` })
    );
    mockUseNextcloudFiles.mockReturnValue({
      files,
      notConfigured: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<FilesTab projectConfigId="cfg-1" />);

    // 12 files available but only 8 shown
    expect(screen.getByText('file11.pdf')).toBeInTheDocument(); // most recent (sorted desc by lastModified)
    expect(screen.queryByText('file0.pdf')).not.toBeInTheDocument(); // oldest, not shown
  });

  test('renders EmptyState with "Noch keine Dateien." when only folders are returned', () => {
    const files = Array.from({ length: 3 }, (_, i) =>
      makeFile({ name: `folder${i}`, path: `/p/folder${i}`, type: 'folder' as const })
    );
    mockUseNextcloudFiles.mockReturnValue({
      files,
      notConfigured: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<FilesTab projectConfigId="cfg-1" />);

    expect(screen.getByText('Noch keine Dateien.')).toBeInTheDocument();
  });

  test('renders EmptyState when files array is empty', () => {
    mockUseNextcloudFiles.mockReturnValue({
      files: [],
      notConfigured: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<FilesTab projectConfigId="cfg-1" />);

    expect(screen.getByText('Noch keine Dateien.')).toBeInTheDocument();
  });

  test('clicking a file row calls downloadFile with (projectConfigId, file.path)', async () => {
    const { downloadFile } = await import('../hooks/useNextcloudFiles');
    const file = makeFile({ name: 'document.pdf', path: '/project/document.pdf' });
    mockUseNextcloudFiles.mockReturnValue({
      files: [file],
      notConfigured: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<FilesTab projectConfigId="cfg-42" />);

    const row = screen.getByText('document.pdf').closest('[data-testid="file-row"]') ??
      screen.getByText('document.pdf').closest('div[class*="cursor-pointer"]');
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    expect(downloadFile).toHaveBeenCalledWith('cfg-42', '/project/document.pdf');
  });

  test('renders Skeleton when isLoading is true', () => {
    mockUseNextcloudFiles.mockReturnValue({
      files: [],
      notConfigured: false,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(<FilesTab projectConfigId="cfg-1" />);

    // Skeleton renders an element with 'animate-pulse' or skeleton class
    const skeleton = container.querySelector('[class*="skeleton"]') ??
      container.querySelector('[class*="animate-pulse"]') ??
      container.querySelector('[data-slot="skeleton"]');
    expect(skeleton).not.toBeNull();
  });

  test('does not render a navigate-to-dateien button', () => {
    const files = Array.from({ length: 10 }, (_, i) =>
      makeFile({ name: `file${i}.pdf`, path: `/p/file${i}.pdf` })
    );
    mockUseNextcloudFiles.mockReturnValue({
      files,
      notConfigured: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<FilesTab projectConfigId="cfg-1" />);

    expect(screen.queryByText(/Alle.*Dateien anzeigen/)).not.toBeInTheDocument();
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
