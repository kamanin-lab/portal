import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepFilesTab } from '../components/steps/StepFilesTab';
import type { Step } from '../types/project';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseNextcloudFilesByPath = vi.fn();
vi.mock('../hooks/useNextcloudFiles', () => ({
  useNextcloudFilesByPath: (...args: unknown[]) => mockUseNextcloudFilesByPath(...args),
  downloadFile: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: 'step-1',
    clickupTaskId: 'cu-1',
    title: 'Moodboard',
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

function makeFile(overrides: Record<string, unknown> = {}) {
  return {
    name: 'test.pdf',
    path: '/project/01_konzept/moodboard/test.pdf',
    type: 'file' as const,
    size: 2048,
    lastModified: '2026-01-15T00:00:00Z',
    mimeType: 'application/pdf',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// StepFilesTab tests
// ---------------------------------------------------------------------------

describe('StepFilesTab', () => {
  beforeEach(() => {
    mockUseNextcloudFilesByPath.mockReset();
    mockUseNextcloudFilesByPath.mockReturnValue({
      files: [],
      notConfigured: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  test('calls useNextcloudFilesByPath with correct path (chapterFolder + slugified step title)', () => {
    render(
      <StepFilesTab
        step={makeStep({ title: 'Moodboard' })}
        projectConfigId="cfg-1"
        chapterFolder="01_konzept"
      />
    );

    expect(mockUseNextcloudFilesByPath).toHaveBeenCalledWith('cfg-1', '01_konzept/moodboard');
  });

  test('calls useNextcloudFilesByPath with slugified step title (special chars)', () => {
    render(
      <StepFilesTab
        step={makeStep({ title: 'Moodboard & Design' })}
        projectConfigId="cfg-1"
        chapterFolder="01_konzept"
      />
    );

    expect(mockUseNextcloudFilesByPath).toHaveBeenCalledWith('cfg-1', '01_konzept/moodboard-design');
  });

  test('renders file names when hook returns files', () => {
    const files = [
      makeFile({ name: 'logo.png', path: '/project/01_konzept/moodboard/logo.png', mimeType: 'image/png' }),
      makeFile({ name: 'brief.pdf', path: '/project/01_konzept/moodboard/brief.pdf' }),
    ];
    mockUseNextcloudFilesByPath.mockReturnValue({
      files,
      notConfigured: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <StepFilesTab
        step={makeStep({ title: 'Moodboard' })}
        projectConfigId="cfg-1"
        chapterFolder="01_konzept"
      />
    );

    expect(screen.getByText('logo.png')).toBeInTheDocument();
    expect(screen.getByText('brief.pdf')).toBeInTheDocument();
  });

  test('renders EmptyState "Noch keine Dateien fuer diesen Schritt." when no files', () => {
    mockUseNextcloudFilesByPath.mockReturnValue({
      files: [],
      notConfigured: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <StepFilesTab
        step={makeStep({ title: 'Moodboard' })}
        projectConfigId="cfg-1"
        chapterFolder="01_konzept"
      />
    );

    // Accept both exact German text (with ü) and ASCII fallback (ue)
    const emptyEl = screen.queryByText('Noch keine Dateien für diesen Schritt.') ??
      screen.queryByText('Noch keine Dateien fuer diesen Schritt.');
    expect(emptyEl).not.toBeNull();
  });

  test('renders EmptyState when only folders are returned', () => {
    mockUseNextcloudFilesByPath.mockReturnValue({
      files: [makeFile({ name: 'subfolder', type: 'folder' as const })],
      notConfigured: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <StepFilesTab
        step={makeStep({ title: 'Moodboard' })}
        projectConfigId="cfg-1"
        chapterFolder="01_konzept"
      />
    );

    const emptyEl = screen.queryByText('Noch keine Dateien für diesen Schritt.') ??
      screen.queryByText('Noch keine Dateien fuer diesen Schritt.');
    expect(emptyEl).not.toBeNull();
  });

  test('renders loading state when isLoading is true', () => {
    mockUseNextcloudFilesByPath.mockReturnValue({
      files: [],
      notConfigured: false,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(
      <StepFilesTab
        step={makeStep({ title: 'Moodboard' })}
        projectConfigId="cfg-1"
        chapterFolder="01_konzept"
      />
    );

    const skeleton = container.querySelector('[class*="skeleton"]') ??
      container.querySelector('[class*="animate-pulse"]') ??
      container.querySelector('[data-slot="skeleton"]');
    expect(skeleton).not.toBeNull();
  });

  test('clicking a file row calls downloadFile with (projectConfigId, file.path)', async () => {
    const { downloadFile } = await import('../hooks/useNextcloudFiles');
    const file = makeFile({ name: 'brief.pdf', path: '/project/01_konzept/moodboard/brief.pdf' });
    mockUseNextcloudFilesByPath.mockReturnValue({
      files: [file],
      notConfigured: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <StepFilesTab
        step={makeStep({ title: 'Moodboard' })}
        projectConfigId="cfg-99"
        chapterFolder="01_konzept"
      />
    );

    const row = screen.getByText('brief.pdf').closest('div[class*="cursor-pointer"]');
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    expect(downloadFile).toHaveBeenCalledWith('cfg-99', '/project/01_konzept/moodboard/brief.pdf');
  });

  test('does not render the drag-and-drop upload zone', () => {
    render(
      <StepFilesTab
        step={makeStep({ title: 'Moodboard' })}
        projectConfigId="cfg-1"
        chapterFolder="01_konzept"
      />
    );

    // Upload zone text should not be present
    expect(screen.queryByText(/Dateien hierher ziehen/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/klicken/i)).not.toBeInTheDocument();
  });
});
