import { describe, test, vi } from 'vitest';

vi.mock('../../hooks/useNextcloudFiles', () => ({
  useNextcloudFilesByPath: vi.fn(),
  downloadFile: vi.fn(),
}));

describe('StepFilesTab (DATA-02)', () => {
  test.todo('constructs Nextcloud path using slugify(step.title) and chapterFolder');
  test.todo('renders files from useNextcloudFilesByPath for the constructed path');
  test.todo('shows EmptyState \'Noch keine Dateien fuer diesen Schritt.\' when folder is empty');
  test.todo('shows loading state while files are fetching');
});
