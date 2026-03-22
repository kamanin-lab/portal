import { useQuery } from '@tanstack/react-query';
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
