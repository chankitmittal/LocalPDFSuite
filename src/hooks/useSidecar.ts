import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';

const BASE_URL = 'http://127.0.0.1:8765';

export function useSidecar() {
  const { setSystemStatus, setJob } = useAppStore();

  const checkHealthAndStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${BASE_URL}/system/status`);
      if (resp.ok) {
        const data = await resp.json();
        setSystemStatus({
          libreofficeInstalled: data.libreoffice?.installed || false,
          tesseractInstalled: data.tesseract?.installed || false,
          libreofficePath: data.libreoffice?.path,
          tesseractPath: data.tesseract?.path,
        });
      }
    } catch (e) {
      console.warn('[LocalPDF] Sidecar not reached on 127.0.0.1:8765. Attempting fallback...');
    }
  }, [setSystemStatus]);

  useEffect(() => {
    checkHealthAndStatus();
    const interval = setInterval(checkHealthAndStatus, 10000);
    return () => clearInterval(interval);
  }, [checkHealthAndStatus]);

  const uploadFile = async (file: File): Promise<{ path: string; filename: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const resp = await fetch(`${BASE_URL}/api/files/upload`, {
      method: 'POST',
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
      const resp = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();

      if (!resp.ok || data.status === 'error') {
        const errMessage = typeof data.detail === 'string' ? data.detail : data.error || data.detail?.error || 'Task failed.';
        setJob({ status: 'error', error: errMessage });
        return null;
      }

      const outPath = data.output_path || data.output_pfx_path || (data.output_files ? data.output_files[0] : undefined);
      const downloadUrl = outPath ? `${BASE_URL}/api/files/download?path=${encodeURIComponent(outPath)}` : undefined;

      const zipDownloadUrl = data.zip_path
        ? `${BASE_URL}/api/files/download?path=${encodeURIComponent(data.zip_path)}`
        : undefined;

      const rawFilesMeta = data.files_meta || (data.output_files ? data.output_files.map((p: string) => ({ name: p.split(/[\\/]/).pop(), path: p })) : []);
      const outputFiles = rawFilesMeta.map((f: any) => ({
        name: f.name || f.path.split(/[\\/]/).pop(),
        path: f.path,
        size: f.size,
        downloadUrl: `${BASE_URL}/api/files/download?path=${encodeURIComponent(f.path)}`,
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
    const a = document.createElement('a');
    a.href = url;
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
  };
}
