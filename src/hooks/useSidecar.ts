import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';

let resolvedPort = 8765;
let portPromise: Promise<number> | null = null;

export async function getSidecarPort(): Promise<number> {
  if (portPromise) return portPromise;

  portPromise = (async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const port = await invoke<number>('get_sidecar_port');
        if (typeof port === 'number' && port > 0) {
          resolvedPort = port;
          useAppStore.getState().setSidecarPort(port);
          return port;
        }
      } catch (e) {
        console.warn('[LocalPDF] Could not query Tauri sidecar port, using default 8765:', e);
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

export function useSidecar() {
  const { setSystemStatus, setJob } = useAppStore();

  useEffect(() => {
    getSidecarPort();
  }, []);

  const checkHealthAndStatus = useCallback(async () => {
    try {
      const port = await getSidecarPort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const savedStatus = useAppStore.getState().systemStatus;
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
      console.warn(`[LocalPDF] Sidecar not reached on 127.0.0.1:${useAppStore.getState().sidecarPort}. Attempting fallback...`);
    }
  }, [setSystemStatus]);

  useEffect(() => {
    checkHealthAndStatus();
    const interval = setInterval(checkHealthAndStatus, 10000);
    return () => clearInterval(interval);
  }, [checkHealthAndStatus]);

  const uploadFile = async (file: File): Promise<{ path: string; filename: string }> => {
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
    const baseUrl = getBaseUrl();

    try {
      const resp = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getSidecarHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();

      if (!resp.ok || data.status === 'error') {
        const errMessage = typeof data.detail === 'string' ? data.detail : data.error || data.detail?.error || 'Task failed.';
        setJob({ status: 'error', error: errMessage });
        return null;
      }

      const token = useAppStore.getState().sessionToken;
      const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';

      const outPath = data.output_path || data.output_pfx_path || (data.output_files ? data.output_files[0] : undefined);
      const downloadUrl = outPath ? `${baseUrl}/api/files/download?path=${encodeURIComponent(outPath)}${tokenQuery}` : undefined;

      const zipDownloadUrl = data.zip_path
        ? `${baseUrl}/api/files/download?path=${encodeURIComponent(data.zip_path)}${tokenQuery}`
        : undefined;

      const rawFilesMeta = data.files_meta || (data.output_files ? data.output_files.map((p: string) => ({ name: p.split(/[\\/]/).pop(), path: p })) : []);
      const outputFiles = rawFilesMeta.map((f: any) => ({
        name: f.name || f.path.split(/[\\/]/).pop(),
        path: f.path,
        size: f.size,
        downloadUrl: `${baseUrl}/api/files/download?path=${encodeURIComponent(f.path)}${tokenQuery}`,
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
        error: err.message || 'Network error communicating with offline sidecar.',
      });
      return null;
    }
  };

  const triggerDownload = (url: string, filename?: string) => {
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
  };

  return {
    uploadFile,
    callApi,
    triggerDownload,
    checkHealthAndStatus,
    getBaseUrl,
  };
}
