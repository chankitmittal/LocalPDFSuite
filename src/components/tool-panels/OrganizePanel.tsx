import React from 'react';
import { useAppStore, showToast } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import { LayoutGrid, Download, CheckCircle, AlertCircle, Save } from 'lucide-react';

export const OrganizePanel: React.FC = () => {
  const { selectedFile, pages, currentJob } = useAppStore();
  const { callApi, triggerDownload } = useSidecar();

  const handleSaveOrganized = async () => {
    if (!selectedFile) {
      showToast('Please upload and select a PDF document first.', 'warning');
      return;
    }

    if (pages.length === 0) {
      showToast('No pages available to organize.', 'warning');
      return;
    }

    const pageActions = pages.map((p) => ({
      page_index: p.pageIndex,
      rotation: p.rotation,
      deleted: p.deleted,
    }));

    await callApi('/api/structural/organize', {
      file_path: selectedFile.path,
      output_filename: `organized_${selectedFile.name}`,
      page_actions: pageActions,
    });
  };

  const activePagesCount = pages.filter((p) => !p.deleted).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-brand-400" />
          Organize & Rotate Pages
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Review the page grid below. Drag pages to reorder, click rotate to orient, or trash to remove pages.
        </p>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-800/40 p-3 rounded-xl border border-slate-800">
        <div>
          <span>Total Original Pages: </span>
          <span className="font-semibold text-white">{pages.length}</span>
        </div>
        <div>
          <span>Resulting Pages: </span>
          <span className="font-semibold text-brand-400">{activePagesCount}</span>
        </div>
      </div>

      <button
        onClick={handleSaveOrganized}
        disabled={!selectedFile || activePagesCount === 0 || currentJob.status === 'running'}
        className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
      >
        <Save className="w-4 h-4" />
        {currentJob.status === 'running' ? 'Saving Organized PDF...' : `Save Organized PDF (${activePagesCount} Pages)`}
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
            <Download className="w-3.5 h-3.5" /> Save File
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
