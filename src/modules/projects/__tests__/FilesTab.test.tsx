import { describe, test, vi } from 'vitest';

vi.mock('../../hooks/useNextcloudFiles', () => ({
  useNextcloudFiles: vi.fn(),
  downloadFile: vi.fn(),
}));

describe('FilesTab (DATA-02)', () => {
  test.todo('renders recent files from useNextcloudFiles (not empty FileItem[])');
  test.todo('filters out entries with type === \'folder\', shows only files');
  test.todo('shows at most 8 files sorted by lastModified descending');
  test.todo('calls downloadFile(projectConfigId, file.path) on file click');
  test.todo('shows EmptyState when no files exist');
  test.todo('shows loading skeleton while useNextcloudFiles is loading');
});
