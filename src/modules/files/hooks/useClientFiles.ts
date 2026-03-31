import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';
import type { NextcloudFile } from '@/modules/projects/types/project';

interface BrowseClientResponse {
  ok: boolean;
  code: string;
  correlationId: string;
  data?: { files: NextcloudFile[] };
}

async function fetchClientFiles(
  subPath?: string,
): Promise<{ files: NextcloudFile[]; notConfigured: boolean }> {
  const { data, error } = await supabase.functions.invoke<BrowseClientResponse>(
    'nextcloud-files',
    {
      body: {
        action: 'browse-client',
        ...(subPath ? { sub_path: subPath } : {}),
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

/**
 * Hook to browse client-level Nextcloud files.
 * Uses the browse-client Edge Function action which derives the root
 * from the authenticated user's profiles.nextcloud_client_root.
 */
export function useClientFiles(subPath?: string) {
  const queryKey = ['client-files', subPath ?? 'root'];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchClientFiles(subPath),
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
// Download helper for client-root files (non-hook, triggers browser download)
// ---------------------------------------------------------------------------

/**
 * Download a file from the client's Nextcloud root.
 * Uses the download-client-file Edge Function action which derives the root
 * from the authenticated user's profiles.nextcloud_client_root.
 */
export async function downloadClientFile(filePath: string): Promise<void> {
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
      action: 'download-client-file',
      file_path: filePath,
    }),
  });

  if (!resp.ok) {
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

// ---------------------------------------------------------------------------
// Upload helper for client-root files (non-hook, used by action bar)
// ---------------------------------------------------------------------------

/**
 * Upload a file to the client's Nextcloud root (optionally into a sub-path).
 * Uses the upload-client-file Edge Function action which derives the root
 * from the authenticated user's profiles.nextcloud_client_root.
 */
export async function uploadClientFile(subPath: string, file: File): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Nicht authentifiziert');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  const formData = new FormData();
  formData.append('action', 'upload-client-file');
  if (subPath) {
    formData.append('sub_path', subPath);
  }
  formData.append('file', file);

  const resp = await fetch(`${supabaseUrl}/functions/v1/nextcloud-files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });

  if (!resp.ok) {
    let message = 'Upload fehlgeschlagen';
    try {
      const err = await resp.json();
      message = err.message || err.code || message;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  const result = await resp.json();
  if (!result.ok) {
    throw new Error(result.message || result.code || 'Upload fehlgeschlagen');
  }
}

// ---------------------------------------------------------------------------
// Create-folder helper for client-root (non-hook, used by action bar)
// ---------------------------------------------------------------------------

/**
 * Create a folder under the client's Nextcloud root.
 * Uses the mkdir-client Edge Function action which derives the root
 * from the authenticated user's profiles.nextcloud_client_root.
 */
export async function createClientFolder(folderPath: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('nextcloud-files', {
    body: {
      action: 'mkdir-client',
      folder_path: folderPath,
    },
  });

  if (error) throw new Error(error.message || 'Verbindungsfehler');
  if (!data?.ok) {
    throw new Error(data?.message || data?.code || 'Ordner konnte nicht erstellt werden');
  }
}

// ---------------------------------------------------------------------------
// Client file activity types + hooks
// ---------------------------------------------------------------------------

export interface ClientFileActivityRecord {
  id: string;
  event_type: 'file_uploaded' | 'folder_created';
  name: string;
  path: string | null;
  source: 'portal' | 'nextcloud_direct';
  actor_label: string | null;
  created_at: string;
}

export function useClientFileActivity() {
  return useQuery<ClientFileActivityRecord[]>({
    queryKey: ['client-file-activity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_file_activity')
        .select('id, event_type, name, path, source, actor_label, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return [];
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useSyncClientFileActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await supabase.functions.invoke('nextcloud-files', {
          body: { action: 'sync_activity_client' },
        });
      } catch {
        // Silent — sync is best-effort
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-file-activity'] });
    },
  });
}
