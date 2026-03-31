export interface UploadProgressEvent {
  loaded: number;  // bytes transferred
  total: number;   // total bytes
}

export function uploadWithProgress(
  url: string,
  formData: FormData,
  headers: Record<string, string>,
  onProgress?: (e: UploadProgressEvent) => void,
): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress({ loaded: e.loaded, total: e.total });
        }
      });
    }

    xhr.addEventListener('load', () => {
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: xhr.responseText });
    });

    xhr.addEventListener('error', () => reject(new Error('Netzwerkfehler beim Upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload abgebrochen')));

    xhr.open('POST', url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.send(formData);
  });
}
