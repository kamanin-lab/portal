import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';
import type { NextcloudFile } from '../types/project';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ListResponse {
  ok: boolean;
  code: string;
  correlationId: string;
  data?: { files: NextcloudFile[] };
}

interface UploadResponse {
  ok: boolean;
  code: string;
  correlationId: string;
  data?: { name: string; size: number; path: string };
}

// ---------------------------------------------------------------------------
// Fetch function
// ---------------------------------------------------------------------------

async function fetchFiles(
  projectConfigId: string,
  chapterSortOrder?: number,
): Promise<{ files: NextcloudFile[]; notConfigured: boolean }> {
  const { data, error } = await supabase.functions.invoke<ListResponse>(
    'nextcloud-files',
    {
      body: {
        action: 'list',
        project_config_id: projectConfigId,
        ...(chapterSortOrder !== undefined ? { chapter_sort_order: chapterSortOrder } : {}),
      },
    },
  );

  if (error) throw new Error(error.message || 'Verbindungsfehler');

  if (data?.code === 'NEXTCLOUD_NOT_CONFIGURED') {
    return { files: [], notConfigured: true };
  }

  if (!data?.ok) {
    throw new Error(data?.code || 'Unbekannter Fehler');
  }

  return { files: data.data?.files ?? [], notConfigured: false };
}

// ---------------------------------------------------------------------------
// Fetch function (path-based)
// ---------------------------------------------------------------------------

async function fetchFilesByPath(
  projectConfigId: string,
  subPath: string,
): Promise<{ files: NextcloudFile[]; notConfigured: boolean }> {
  const { data, error } = await supabase.functions.invoke<ListResponse>(
    'nextcloud-files',
    {
      body: {
        action: 'list',
        project_config_id: projectConfigId,
        sub_path: subPath,
      },
    },
  );

  if (error) throw new Error(error.message || 'Verbindungsfehler');
  if (data?.code === 'NEXTCLOUD_NOT_CONFIGURED') {
    return { files: [], notConfigured: true };
  }
  if (!data?.ok) throw new Error(data?.code || 'Unbekannter Fehler');

  return { files: data.data?.files ?? [], notConfigured: false };
}

// ---------------------------------------------------------------------------
// Hook: useNextcloudFiles
// ---------------------------------------------------------------------------

export function useNextcloudFiles(projectConfigId: string, chapterSortOrder?: number) {
  const queryKey = ['nextcloud-files', projectConfigId, chapterSortOrder ?? 'root'];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchFiles(projectConfigId, chapterSortOrder),
    enabled: !!projectConfigId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return {
    files: query.data?.files ?? [],
    notConfigured: query.data?.notConfigured ?? false,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// ---------------------------------------------------------------------------
// Hook: useNextcloudFilesByPath
// ---------------------------------------------------------------------------

export function useNextcloudFilesByPath(projectConfigId: string, subPath: string) {
  const queryKey = ['nextcloud-files', projectConfigId, subPath];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchFilesByPath(projectConfigId, subPath),
    enabled: !!projectConfigId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return {
    files: query.data?.files ?? [],
    notConfigured: query.data?.notConfigured ?? false,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// ---------------------------------------------------------------------------
// Hook: useUploadFile  (mutation)
// ---------------------------------------------------------------------------

export function useUploadFile(projectConfigId: string, chapterSortOrder?: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<UploadResponse> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nicht authentifiziert');

      const formData = new FormData();
      formData.append('action', 'upload');
      formData.append('project_config_id', projectConfigId);
      if (chapterSortOrder !== undefined) {
        formData.append('chapter_sort_order', String(chapterSortOrder));
      }
      formData.append('file', file);

      // supabase.functions.invoke doesn't support FormData well for streaming,
      // so use raw fetch to the Edge Function endpoint.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const resp = await fetch(`${supabaseUrl}/functions/v1/nextcloud-files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const result: UploadResponse = await resp.json();
      if (!result.ok) throw new Error(result.code || 'Upload fehlgeschlagen');
      return result;
    },
    onSuccess: () => {
      // Invalidate file list for this folder
      const queryKey = ['nextcloud-files', projectConfigId, chapterSortOrder ?? 'root'];
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

// ---------------------------------------------------------------------------
// Hook: useUploadFileByPath  (mutation, path-based)
// ---------------------------------------------------------------------------

export function useUploadFileByPath(projectConfigId: string, subPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<UploadResponse> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nicht authentifiziert');

      const formData = new FormData();
      formData.append('action', 'upload');
      formData.append('project_config_id', projectConfigId);
      formData.append('sub_path', subPath);
      formData.append('file', file);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const resp = await fetch(`${supabaseUrl}/functions/v1/nextcloud-files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      const result: UploadResponse = await resp.json();
      if (!result.ok) throw new Error(result.code || 'Upload fehlgeschlagen');
      return result;
    },
    onSuccess: async (_data, file) => {
      queryClient.invalidateQueries({ queryKey: ['nextcloud-files', projectConfigId, subPath] });
      // Also invalidate root if uploading to a chapter root
      if (!subPath.includes('/')) {
        queryClient.invalidateQueries({ queryKey: ['nextcloud-files', projectConfigId, 'root'] });
      }
      // Log file activity (silent — never blocks UI)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          await supabase.from('project_file_activity').insert({
            project_config_id: projectConfigId,
            profile_id: session.user.id,
            event_type: 'file_uploaded',
            name: file.name,
            path: subPath ? `${subPath}/${file.name}` : file.name,
          });
          queryClient.invalidateQueries({ queryKey: ['project-file-activity', projectConfigId] });
        }
      } catch {
        // Silent — file activity logging should never block the UI
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Hook: useCreateFolder  (mutation)
// ---------------------------------------------------------------------------

interface MkdirResponse {
  ok: boolean;
  code: string;
  correlationId: string;
  data?: { path: string };
}

export function useCreateFolder(projectConfigId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folderPath: string): Promise<MkdirResponse> => {
      const { data, error } = await supabase.functions.invoke<MkdirResponse>(
        'nextcloud-files',
        {
          body: {
            action: 'mkdir',
            project_config_id: projectConfigId,
            folder_path: folderPath,
          },
        },
      );

      if (error) throw new Error(error.message || 'Verbindungsfehler');
      if (!data?.ok) throw new Error(data?.code || 'Ordner konnte nicht erstellt werden');
      return data;
    },
    onSuccess: async (_data, folderPath) => {
      // Invalidate parent folder and root
      const parentPath = folderPath.includes('/')
        ? folderPath.substring(0, folderPath.lastIndexOf('/'))
        : '';
      queryClient.invalidateQueries({ queryKey: ['nextcloud-files', projectConfigId, parentPath] });
      queryClient.invalidateQueries({ queryKey: ['nextcloud-files', projectConfigId, 'root'] });
      // Log folder creation activity (silent — never blocks UI)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          const folderName = folderPath.split('/').pop() || folderPath;
          await supabase.from('project_file_activity').insert({
            project_config_id: projectConfigId,
            profile_id: session.user.id,
            event_type: 'folder_created',
            name: folderName,
            path: folderPath,
          });
          queryClient.invalidateQueries({ queryKey: ['project-file-activity', projectConfigId] });
        }
      } catch {
        // Silent — file activity logging should never block the UI
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Download helper (non-hook, triggers browser download)
// ---------------------------------------------------------------------------

export async function downloadFile(
  projectConfigId: string,
  filePath: string,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Nicht authentifiziert');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  const resp = await fetch(`${supabaseUrl}/functions/v1/nextcloud-files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'download',
      project_config_id: projectConfigId,
      file_path: filePath,
    }),
  });

  if (!resp.ok) {
    // Try to parse error JSON
    try {
      const err = await resp.json();
      throw new Error(err.message || err.code || 'Download fehlgeschlagen');
    } catch {
      throw new Error('Download fehlgeschlagen');
    }
  }

  // Create a download from the streamed response
  const blob = await resp.blob();
  const fileName = filePath.split('/').pop() || 'download';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
