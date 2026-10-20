import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import { MergeInteractiveOrganizer } from './MergeInteractiveOrganizer';
import { SplitPageOrganizer } from './SplitPageOrganizer';
import {
  Layers,
  Scissors,
  Download,
  CheckCircle,
  AlertCircle,
  Archive,
  FileText,
  Sliders,
  ChevronDown,
} from 'lucide-react';

export const MergeSplitPanel: React.FC = () => {
  const {
    files,
    selectedFile,
    setSelectedFile,
    currentJob,
    activeTool,
    moveFile,
    removeFile,
    reorderFiles,
  } = useAppStore();
  const { callApi, triggerDownload } = useSidecar();

  // Split settings
  const [splitMode, setSplitMode] = useState<'extract_all' | 'range' | 'fixed'>('range');
  const [customRange, setCustomRange] = useState('1-3, 5');
  const [fixedInterval, setFixedInterval] = useState(2);

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const isMerge = activeTool === 'merge';

  // In split mode, identify which PDF is currently active
  const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
  const activePdf =
    selectedFile && selectedFile.name.toLowerCase().endsWith('.pdf')
      ? selectedFile
      : pdfFiles[0] || null;

  const handleMerge = async () => {
    if (files.length < 2) {
      alert('Please select at least 2 PDF files to merge.');
      return;
    }
    const filePaths = files.map((f) => f.path);
    await callApi('/api/structural/merge', {
      file_paths: filePaths,
      output_filename: 'merged_document.pdf',
    });
  };

  const handleSplit = async () => {
    if (!activePdf) {
      alert('Please upload or select a PDF file to split.');
      return;
    }
    if (splitMode === 'range' && !customRange.trim()) {
      alert('Please select at least one page or enter a page range (e.g. 1-3, 5).');
      return;
    }

    await callApi('/api/structural/split', {
      file_path: activePdf.path,
      mode: splitMode,
      ranges: splitMode === 'range' ? customRange : undefined,
      fixed_interval: splitMode === 'fixed' ? Number(fixedInterval) : 1,
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* Panel Header */}
      <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            {isMerge ? (
              <Layers className="w-5 h-5 text-brand-400" />
            ) : (
              <Scissors className="w-5 h-5 text-brand-400" />
            )}
            {isMerge ? 'Merge Multiple PDFs' : 'Split PDF Document'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isMerge
              ? 'Arrange the exact order of documents below using interactive cover previews, then merge them into a single clean PDF.'
              : 'Use the interactive Page Organizer below to inspect pages, click to select ranges, or split into fixed intervals.'}
          </p>
        </div>
      </div>

      {isMerge ? (
        /* ==================== MERGE FEATURE ==================== */
        <div className="space-y-6">
          <MergeInteractiveOrganizer
            files={files}
            onMoveFile={moveFile}
            onRemoveFile={removeFile}
            onReorderFiles={reorderFiles}
          />

          <button
            onClick={handleMerge}
            disabled={files.length < 2 || currentJob.status === 'running'}
            className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
          >
            <Layers className="w-4 h-4" />
            {currentJob.status === 'running'
              ? 'Merging documents in specified order...'
              : `Merge ${files.length} PDFs in Sequence`}
          </button>
        </div>
      ) : (
        /* ==================== SPLIT FEATURE ==================== */
        <div className="space-y-6">
          {/* Document Picker if multiple files loaded */}
          {pdfFiles.length > 1 && (
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-brand-400" /> Active Document to Split:
              </span>
              <div className="flex items-center space-x-1.5 overflow-x-auto max-w-md">
                {pdfFiles.map((pdf) => (
                  <button
                    key={pdf.id}
                    onClick={() => setSelectedFile(pdf)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all truncate max-w-[180px] ${
                      activePdf?.id === pdf.id
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                    title={pdf.name}
                  >
                    {pdf.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Page Organizer View for Split */}
          {activePdf ? (
            <div className="bg-slate-950/30 border border-slate-800 rounded-2xl p-4 space-y-4">
              <SplitPageOrganizer
                file={activePdf}
                splitMode={splitMode}
                customRange={customRange}
                onRangeChange={setCustomRange}
                fixedInterval={fixedInterval}
              />
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500 bg-slate-950/40 border border-slate-800 rounded-2xl">
              No PDF uploaded. Please drag and drop or upload a PDF above to open its Page Organizer.
            </div>
          )}

          {/* Split Mode Selector Tabs */}
          <div className="space-y-4 pt-2 border-t border-slate-800">
            <label className="text-xs font-semibold text-slate-300 block">
              Choose Split Method:
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                onClick={() => setSplitMode('range')}
                className={`p-3 rounded-xl border text-xs font-medium text-left transition-all ${
                  splitMode === 'range'
                    ? 'border-brand-500 bg-brand-500/10 text-white shadow-sm'
                    : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-slate-200 flex items-center justify-between">
                  <span>Custom Ranges</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300">
                    Interactive
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Click pages in grid or enter ranges like 2-3, 5
                </div>
              </button>

              <button
                onClick={() => setSplitMode('fixed')}
                className={`p-3 rounded-xl border text-xs font-medium text-left transition-all ${
                  splitMode === 'fixed'
                    ? 'border-brand-500 bg-brand-500/10 text-white shadow-sm'
                    : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-slate-200">Fixed Interval</div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Split into parts of N pages each
                </div>
              </button>

              <button
                onClick={() => setSplitMode('extract_all')}
                className={`p-3 rounded-xl border text-xs font-medium text-left transition-all ${
                  splitMode === 'extract_all'
                    ? 'border-brand-500 bg-brand-500/10 text-white shadow-sm'
                    : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-slate-200">Extract All Pages</div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Save each page as an individual PDF
                </div>
              </button>
            </div>

            {/* Range Input with 2-way sync with the Page Organizer */}
            {splitMode === 'range' && (
              <div className="space-y-1.5 p-4 rounded-xl bg-slate-800/30 border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">
                    Selected Page Ranges (auto-updated from grid selection):
                  </label>
                  <span className="text-[11px] text-brand-400 font-mono">
                    {customRange.trim() ? customRange : 'None selected'}
                  </span>
                </div>
                <input
                  type="text"
                  value={customRange}
                  onChange={(e) => setCustomRange(e.target.value)}
                  placeholder="e.g. 2 - 3, 5"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
                />
                <p className="text-[11px] text-slate-400">
                  Tip: Clicking any page in the <strong>Page Organizer View</strong> above toggles
                  it automatically here.
                </p>
              </div>
            )}

            {/* Fixed interval number input */}
            {splitMode === 'fixed' && (
              <div className="space-y-1.5 p-4 rounded-xl bg-slate-800/30 border border-slate-800">
                <label className="text-xs font-medium text-slate-300">
                  Pages per split document:
                </label>
                <input
                  type="number"
                  min={1}
                  value={fixedInterval}
                  onChange={(e) => setFixedInterval(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
                />
                <p className="text-[11px] text-slate-400">
                  Check the group tags on the thumbnails above to preview which pages will belong to
                  each output file.
                </p>
              </div>
            )}

            <button
              onClick={handleSplit}
              disabled={!activePdf || currentJob.status === 'running'}
              className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
            >
              <Scissors className="w-4 h-4" />
              {currentJob.status === 'running'
                ? 'Splitting document...'
                : `Split PDF Document (${activePdf?.name || ''})`}
            </button>
          </div>
        </div>
      )}

      {/* Result feedback */}
      {currentJob.status === 'success' && (
        <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-emerald-400 text-xs">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold text-sm">
                {currentJob.outputFiles && currentJob.outputFiles.length > 1
                  ? `Successfully Generated ${currentJob.outputFiles.length} Split Files!`
                  : currentJob.message || 'Operation Complete!'}
              </span>
            </div>

            {/* ZIP download button if multiple files */}
            {currentJob.zipDownloadUrl && (
              <button
                onClick={() => triggerDownload(currentJob.zipDownloadUrl!, 'split_documents.zip')}
                className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 shadow-md transition-colors"
              >
                <Archive className="w-4 h-4" />
                Download All as ZIP ({currentJob.outputFiles?.length} files)
              </button>
            )}

            {/* Single file download button if only 1 file */}
            {!currentJob.zipDownloadUrl && currentJob.downloadUrl && (
              <button
                onClick={() => triggerDownload(currentJob.downloadUrl!)}
                className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Save File
              </button>
            )}
          </div>

          {/* List of individual split files with individual download buttons */}
          {currentJob.outputFiles && currentJob.outputFiles.length > 1 && (
            <div className="space-y-2 pt-2 border-t border-emerald-500/20">
              <div className="text-[11px] font-medium text-emerald-300">
                Individual Split Files ({currentJob.outputFiles.length}):
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {currentJob.outputFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        #{idx + 1}
                      </span>
                      <span className="text-slate-200 font-medium truncate">{file.name}</span>
                      {file.size && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({formatSize(file.size)})
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => triggerDownload(file.downloadUrl, file.name)}
                      className="py-1 px-2.5 rounded-md bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors flex-shrink-0 ml-2"
                    >
                      <Download className="w-3 h-3" /> Save
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
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
