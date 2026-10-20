import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import { ScanText, Download, CheckCircle, AlertCircle, Info } from 'lucide-react';

export const OcrPanel: React.FC = () => {
  const { selectedFile, currentJob, systemStatus } = useAppStore();
  const { callApi, triggerDownload } = useSidecar();

  const [language, setLanguage] = useState('eng');
  const [dpi, setDpi] = useState(300);

  const handleRunOcr = async () => {
    if (!selectedFile) {
      alert('Please upload and select a PDF document first.');
      return;
    }

    await callApi('/api/ocr/run', {
      file_path: selectedFile.path,
      language,
      dpi: Number(dpi),
      custom_tesseract_path: systemStatus.tesseractPath,
      output_filename: `searchable_ocr_${selectedFile.name}`,
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <ScanText className="w-5 h-5 text-brand-400" />
          Offline OCR: Searchable PDF Generation
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Renders scanned pages at 300 DPI, runs local Tesseract OCR (Apache-2.0), and builds an invisible searchable text sandwich layer.
        </p>
      </div>

      {!systemStatus.tesseractInstalled && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold">
            <Info className="w-4 h-4 text-amber-400" />
            Tesseract OCR Not Detected In Standard Paths
          </div>
          <p className="text-slate-400">
            To perform OCR, install Tesseract OCR v5 or enter its custom executable path in the Settings tab.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-300">OCR Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full mt-1.5 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="eng">English (eng)</option>
            <option value="fra">French (fra)</option>
            <option value="spa">Spanish (spa)</option>
            <option value="deu">German (deu)</option>
            <option value="ita">Italian (ita)</option>
            <option value="chi_sim">Chinese Simplified (chi_sim)</option>
            <option value="jpn">Japanese (jpn)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-300">Rendering Precision (DPI)</label>
          <select
            value={dpi}
            onChange={(e) => setDpi(Number(e.target.value))}
            className="w-full mt-1.5 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value={200}>200 DPI (Faster)</option>
            <option value={300}>300 DPI (Recommended for OCR)</option>
            <option value={400}>400 DPI (High Precision)</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleRunOcr}
        disabled={!selectedFile || currentJob.status === 'running'}
        className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
      >
        <ScanText className="w-4 h-4" />
        {currentJob.status === 'running' ? 'Running Offline OCR...' : 'Generate Searchable PDF'}
      </button>

      {/* Result feedback */}
      {currentJob.status === 'success' && currentJob.downloadUrl && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-emerald-400 text-xs">
            <CheckCircle className="w-4 h-4" />
            <span className="font-medium">{currentJob.message}</span>
          </div>
          <button
            onClick={() => triggerDownload(currentJob.downloadUrl!)}
            className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Save Searchable PDF
          </button>
        </div>
      )}

      {currentJob.status === 'error' && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{currentJob.error}</span>
        </div>
      )}
    </div>
  );
};
