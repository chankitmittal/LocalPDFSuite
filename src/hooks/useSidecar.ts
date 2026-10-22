import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';

let resolvedPort = 8765;
let portPromise: Promise<number> | null = null;

export function isTauriAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function getSidecarPort(): Promise<number> {
  if (portPromise) return portPromise;

  portPromise = (async () => {
    if (isTauriAvailable()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const port = await invoke<number>('get_sidecar_port');
        if (typeof port === 'number' && port > 0) {
          resolvedPort = port;
          useAppStore.getState().setSidecarPort(port);
          return port;
        }
      } catch {
        // In Stdio mode, port is not used
      }
    }
    const current = useAppStore.getState().sidecarPort;
    resolvedPort = current || 8765;
    return resolvedPort;
  })();

  return portPromise;
}

export function getBaseUrl(): string {
  const current = useAppStore.getState().sidecarPort;
  return `http://127.0.0.1:${current || resolvedPort || 8765}`;
}

export function getSidecarHeaders(): Record<string, string> {
  const token = useAppStore.getState().sessionToken;
  const headers: Record<string, string> = {};
  if (token) {
    headers['X-LocalPDF-Token'] = token;
  }
  return headers;
}

/**
 * Universal caller: invokes Tauri native Stdio IPC when in Tauri,
 * or falls back to loopback HTTP fetch when in web dev mode.
 */
export async function callSidecarEndpoint<T = any>(endpoint: string, payload: any = {}): Promise<T> {
  if (isTauriAvailable()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const action = endpoint.replace(/^\/api\//, '').replace(/^\//, '');
    return await invoke<T>('call_engine', { action, payload });
  }

  // Web Browser HTTP Fallback
  const baseUrl = getBaseUrl();
  const resp = await fetch(`${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getSidecarHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    let errMessage = resp.statusText;
    try {
      const errData = await resp.json();
      errMessage = typeof errData.detail === 'string' ? errData.detail : errData.error || errMessage;
    } catch {
      // ignore json parse error
    }
    throw new Error(errMessage);
  }

  return await resp.json();
}

/**
 * Reads binary file data into an ArrayBuffer either directly from disk via Tauri IPC
 * or through the download HTTP route in browser fallback.
 */
export async function readFileData(filePath: string): Promise<ArrayBuffer> {
  if (isTauriAvailable()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const bytes = await invoke<number[]>('read_file_binary', { filePath });
    return new Uint8Array(bytes).buffer;
  }

  const baseUrl = getBaseUrl();
  const token = useAppStore.getState().sessionToken;
  const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';
  const url = `${baseUrl}/api/files/download?path=${encodeURIComponent(filePath)}${tokenQuery}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to read file: ${resp.statusText}`);
  }
  return await resp.arrayBuffer();
}

export function useSidecar() {
  const { setSystemStatus, setJob } = useAppStore();

  useEffect(() => {
    getSidecarPort();
  }, []);

  const checkHealthAndStatus = useCallback(async () => {
    try {
      const savedStatus = useAppStore.getState().systemStatus;
      if (isTauriAvailable()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const [so, tess] = await invoke<[any, any]>('check_plugins', {
            customSoffice: savedStatus.libreofficePath || null,
            customTesseract: savedStatus.tesseractPath || null,
          });
          setSystemStatus({
            libreofficeInstalled: so.installed || false,
            tesseractInstalled: tess.installed || false,
            libreofficePath: savedStatus.libreofficePath || so.path,
            tesseractPath: savedStatus.tesseractPath || tess.path,
          });
          return;
        } catch {
          // If check_plugins is not defined, fallback to call_engine
          const data = await callSidecarEndpoint<any>('system_status', {
            custom_soffice: savedStatus.libreofficePath,
            custom_tesseract: savedStatus.tesseractPath,
          });
          setSystemStatus({
            libreofficeInstalled: data.libreoffice?.installed || false,
            tesseractInstalled: data.tesseract?.installed || false,
            libreofficePath: savedStatus.libreofficePath || data.libreoffice?.path,
            tesseractPath: savedStatus.tesseractPath || data.tesseract?.path,
          });
          return;
        }
      }

      // Browser fallback
      const port = await getSidecarPort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const queryParams = new URLSearchParams();
      if (savedStatus.libreofficePath) queryParams.set('custom_soffice', savedStatus.libreofficePath);
      if (savedStatus.tesseractPath) queryParams.set('custom_tesseract', savedStatus.tesseractPath);
      const url = `${baseUrl}/system/status${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

      const resp = await fetch(url, { headers: getSidecarHeaders() });
      if (resp.ok) {
        const data = await resp.json();
        setSystemStatus({
          libreofficeInstalled: data.libreoffice?.installed || false,
          tesseractInstalled: data.tesseract?.installed || false,
          libreofficePath: savedStatus.libreofficePath || data.libreoffice?.path,
          tesseractPath: savedStatus.tesseractPath || data.tesseract?.path,
        });
      }
    } catch (e) {
      console.warn(`[LocalPDF] Sidecar status check warning:`, e);
    }
  }, [setSystemStatus]);

  useEffect(() => {
    checkHealthAndStatus();
    const interval = setInterval(checkHealthAndStatus, 10000);
    return () => clearInterval(interval);
  }, [checkHealthAndStatus]);

  const uploadFile = async (file: File): Promise<{ path: string; filename: string }> => {
    if (isTauriAvailable()) {
      const { invoke } = await import('@tauri-apps/api/core');
      const arrayBuf = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuf));
      const res = await invoke<{ file_path: string; filename: string; size: number }>('upload_temp_file', {
        filename: file.name,
        bytes,
      });
      return { path: res.file_path, filename: res.filename };
    }

    // Browser HTTP fallback
    const baseUrl = getBaseUrl();
    const formData = new FormData();
    formData.append('file', file);

    const resp = await fetch(`${baseUrl}/api/files/upload`, {
      method: 'POST',
      headers: getSidecarHeaders(),
      body: formData,
    });

    if (!resp.ok) {
      throw new Error(`File upload failed: ${resp.statusText}`);
    }

    const data = await resp.json();
    return { path: data.file_path, filename: data.filename };
  };

  const callApi = async (endpoint: string, payload: any) => {
    setJob({ status: 'running', message: 'Processing offline...' });

    try {
      const data = await callSidecarEndpoint(endpoint, payload);

      if (data && data.status === 'error') {
        const errMessage = typeof data.detail === 'string' ? data.detail : data.error || 'Task failed.';
        setJob({ status: 'error', error: errMessage });
        return null;
      }

      const baseUrl = getBaseUrl();
      const token = useAppStore.getState().sessionToken;
      const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';

      const outPath = data.output_path || data.output_pfx_path || (data.output_files ? data.output_files[0] : undefined);
      const downloadUrl = outPath
        ? (outPath.startsWith('http') ? outPath : `${baseUrl}/api/files/download?path=${encodeURIComponent(outPath)}${tokenQuery}`)
        : undefined;

      const zipDownloadUrl = data.zip_path
        ? (data.zip_path.startsWith('http') ? data.zip_path : `${baseUrl}/api/files/download?path=${encodeURIComponent(data.zip_path)}${tokenQuery}`)
        : undefined;

      const rawFilesMeta = data.files_meta || (data.output_files ? data.output_files.map((p: string) => ({ name: p.split(/[\\/]/).pop(), path: p })) : []);
      const outputFiles = rawFilesMeta.map((f: any) => ({
        name: f.name || f.path.split(/[\\/]/).pop(),
        path: f.path,
        size: f.size,
        downloadUrl: f.path.startsWith('http') ? f.path : `${baseUrl}/api/files/download?path=${encodeURIComponent(f.path)}${tokenQuery}`,
      }));

      setJob({
        status: 'success',
        message: 'Completed successfully!',
        outputPath: outPath,
        downloadUrl,
        zipDownloadUrl,
        outputFiles: outputFiles.length > 0 ? outputFiles : undefined,
        details: data,
      });

      return data;
    } catch (err: any) {
      setJob({
        status: 'error',
        error: err.message || 'Error communicating with offline sidecar.',
      });
      return null;
    }
  };

  const triggerDownload = async (url: string, filename?: string) => {
    if (isTauriAvailable()) {
      try {
        let targetPath = url;
        if (url.includes('path=')) {
          const match = url.match(/[?&]path=([^&]+)/);
          if (match) targetPath = decodeURIComponent(match[1]);
        }

        if (targetPath.includes('/') || targetPath.includes('\\')) {
          const buffer = await readFileData(targetPath);
          const blob = new Blob([buffer]);
          const blobUrl = URL.createObjectURL(blob);
          const safeName = filename || targetPath.split(/[\\/]/).pop() || 'downloaded_file';

          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = safeName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
          useAppStore.getState().addToast(`Document successfully saved: ${safeName}`, 'success');
          return;
        }
      } catch (e) {
        console.warn('[LocalPDF] Direct binary download failed, attempting URL anchor fallback:', e);
      }
    }

    const baseUrl = getBaseUrl();
    const token = useAppStore.getState().sessionToken;
    let fullUrl = url.startsWith('http://') || url.startsWith('https://')
      ? url
      : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;

    if (token && !fullUrl.includes('token=')) {
      const sep = fullUrl.includes('?') ? '&' : '?';
      fullUrl = `${fullUrl}${sep}token=${encodeURIComponent(token)}`;
    }

    const a = document.createElement('a');
    a.href = fullUrl;
    if (filename) a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    useAppStore.getState().addToast(`Document successfully saved: ${filename || 'file'}`, 'success');
  };

  return {
    uploadFile,
    callApi,
    triggerDownload,
    checkHealthAndStatus,
    getBaseUrl,
  };
}
