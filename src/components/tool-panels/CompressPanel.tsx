import React, { useState } from 'react';
import { useAppStore, showToast } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import { formatSize } from '../../utils/formatters';
import { Minimize2, Download, CheckCircle, AlertCircle, Sparkles, Zap, Shield } from 'lucide-react';

export const CompressPanel: React.FC = () => {
  const { selectedFile, currentJob } = useAppStore();
  const { callApi, triggerDownload } = useSidecar();
  const [level, setLevel] = useState<'low' | 'medium' | 'extreme'>('medium');

  const handleCompress = async () => {
    if (!selectedFile) {
      showToast('Please upload and select a PDF file to compress.', 'warning');
      return;
    }

    await callApi('/api/compress', {
      file_path: selectedFile.path,
      level,
      output_filename: `compressed_${selectedFile.name}`,
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Minimize2 className="w-5 h-5 text-brand-400" />
          Ghostscript-Free PDF Compression
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          High-performance XObject downsampling and QPDF stream optimization. 100% offline.
        </p>
      </div>

      {/* Compression Level Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => setLevel('low')}
          className={`p-4 rounded-xl border text-left transition-all ${
            level === 'low'
              ? 'border-brand-500 bg-brand-500/10 text-white ring-1 ring-brand-500'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 text-brand-400 mb-1">
            <Shield className="w-4 h-4" />
            <span className="font-semibold text-xs text-slate-200">High Quality</span>
          </div>
          <div className="text-[11px] text-slate-400">200 DPI threshold</div>
          <div className="text-[10px] text-slate-500 mt-1">Best for print / vector fidelity</div>
        </button>

        <button
          onClick={() => setLevel('medium')}
          className={`p-4 rounded-xl border text-left transition-all ${
            level === 'medium'
              ? 'border-brand-500 bg-brand-500/10 text-white ring-1 ring-brand-500'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 text-brand-400 mb-1">
            <Sparkles className="w-4 h-4" />
            <span className="font-semibold text-xs text-slate-200">Recommended</span>
          </div>
          <div className="text-[11px] text-slate-400">144 DPI threshold</div>
          <div className="text-[10px] text-slate-500 mt-1">Ideal balance of size & clarity</div>
        </button>

        <button
          onClick={() => setLevel('extreme')}
          className={`p-4 rounded-xl border text-left transition-all ${
            level === 'extreme'
              ? 'border-brand-500 bg-brand-500/10 text-white ring-1 ring-brand-500'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 text-amber-400 mb-1">
            <Zap className="w-4 h-4" />
            <span className="font-semibold text-xs text-slate-200">Smallest Size</span>
          </div>
          <div className="text-[11px] text-slate-400">72 DPI threshold</div>
          <div className="text-[10px] text-slate-500 mt-1">Maximum compression for email</div>
        </button>
      </div>

      <button
        onClick={handleCompress}
        disabled={!selectedFile || currentJob.status === 'running'}
        className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
      >
        <Minimize2 className="w-4 h-4" />
        {currentJob.status === 'running' ? 'Compressing PDF...' : 'Compress PDF'}
      </button>

      {/* Result Card */}
      {currentJob.status === 'success' && currentJob.details && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-emerald-400 text-xs">
              <CheckCircle className="w-4 h-4" />
              <span className="font-semibold">Compression Complete!</span>
            </div>
            <span className="text-xs font-bold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
              {currentJob.details.savings_percentage}% Saved
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 bg-slate-900/60 p-3 rounded-lg">
            <div>
              <span className="text-slate-400">Original Size: </span>
              <span className="font-semibold">{formatSize(currentJob.details.original_size)}</span>
            </div>
            <div>
              <span className="text-slate-400">Compressed: </span>
              <span className="font-semibold text-emerald-400">{formatSize(currentJob.details.compressed_size)}</span>
            </div>
          </div>

          <button
            onClick={() => triggerDownload(currentJob.downloadUrl!)}
            className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download Compressed PDF
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
