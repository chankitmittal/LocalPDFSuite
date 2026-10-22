import React, { useEffect, useState, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { UploadedFile } from '../../types';
import { formatPageRanges, parseRangeStringToSet } from '../../utils/pageRanges';
import {
  LayoutGrid,
  CheckSquare,
  Square,
  ZoomIn,
  X,
  ChevronLeft,
  ChevronRight,
  Scissors,
  CheckCircle2,
  Eye,
} from 'lucide-react';

interface SplitPageOrganizerProps {
  file: UploadedFile;
  splitMode: 'extract_all' | 'range' | 'fixed';
  customRange: string;
  onRangeChange: (newRange: string) => void;
  fixedInterval: number;
}

interface PagePreview {
  pageNumber: number;
  thumbnail: string;
}

export const SplitPageOrganizer: React.FC<SplitPageOrganizerProps> = ({
  file,
  splitMode,
  customRange,
  onRangeChange,
  fixedInterval,
}) => {
  const [pages, setPages] = useState<PagePreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState<number | null>(null);

  // Render all pages for the document
  useEffect(() => {
    let isCancelled = false;

    const loadPages = async () => {
      setLoading(true);
      setPages([]);

      try {
        let arrayBuffer: ArrayBuffer;
        if (file.fileObj) {
          arrayBuffer = await file.fileObj.arrayBuffer();
        } else {
          const resp = await fetch(`/api/files/download?path=${encodeURIComponent(file.path)}`);
          arrayBuffer = await resp.arrayBuffer();
        }

        if (isCancelled) return;

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const total = pdf.numPages;
        const renderedPages: PagePreview[] = [];

        for (let i = 1; i <= total; i++) {
          if (isCancelled) return;

          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.35 });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d')!;
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context, viewport }).promise;
          const thumbnail = canvas.toDataURL('image/jpeg', 0.85);

          renderedPages.push({
            pageNumber: i,
            thumbnail,
          });
        }

        if (!isCancelled) {
          setPages(renderedPages);
        }
      } catch (err) {
        console.error(`Failed to load page organizer previews for ${file.name}:`, err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadPages();

    return () => {
      isCancelled = true;
    };
  }, [file]);

  // Selected pages set parsed from the custom range string
  const selectedPagesSet = useMemo(() => {
    return parseRangeStringToSet(customRange, pages.length || 99999);
  }, [customRange, pages.length]);

  // Toggle page selection in range mode
  const togglePageSelection = (pageNumber: number) => {
    if (splitMode !== 'range') return;

    const nextSet = new Set(selectedPagesSet);
    if (nextSet.has(pageNumber)) {
      nextSet.delete(pageNumber);
    } else {
      nextSet.add(pageNumber);
    }

    const newRangeStr = formatPageRanges(Array.from(nextSet));
    onRangeChange(newRangeStr);
  };

  // Helper batch selection actions
  const selectAll = () => {
    const all = pages.map((p) => p.pageNumber);
    onRangeChange(formatPageRanges(all));
  };

  const clearSelection = () => {
    onRangeChange('');
  };

  const selectOddPages = () => {
    const odds = pages.filter((p) => p.pageNumber % 2 !== 0).map((p) => p.pageNumber);
    onRangeChange(formatPageRanges(odds));
  };

  const selectEvenPages = () => {
    const evens = pages.filter((p) => p.pageNumber % 2 === 0).map((p) => p.pageNumber);
    onRangeChange(formatPageRanges(evens));
  };

  const invertSelection = () => {
    const inverted = pages
      .map((p) => p.pageNumber)
      .filter((num) => !selectedPagesSet.has(num));
    onRangeChange(formatPageRanges(inverted));
  };

  // Compute fixed interval group tags for each page
  const getIntervalGroupInfo = (pageNumber: number) => {
    if (splitMode !== 'fixed' || fixedInterval < 1) return null;
    const groupIndex = Math.floor((pageNumber - 1) / fixedInterval) + 1;
    const startPage = (groupIndex - 1) * fixedInterval + 1;
    const endPage = Math.min(groupIndex * fixedInterval, pages.length);
    return {
      groupIndex,
      label: `Part #${groupIndex} (P.${startPage}-${endPage})`,
      isStartOfGroup: (pageNumber - 1) % fixedInterval === 0,
    };
  };

  return (
    <div className="space-y-4">
      {/* Top Header of Page Organizer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <LayoutGrid className="w-4 h-4 text-brand-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Page Organizer View
          </h3>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700">
            {pages.length} Pages Available
          </span>
        </div>

        {/* Action Controls for Custom Range mode */}
        {splitMode === 'range' && pages.length > 0 && (
          <div className="flex items-center flex-wrap gap-1.5 text-[11px]">
            <span className="text-slate-400 mr-1 hidden sm:inline">Quick Select:</span>
            <button
              onClick={selectAll}
              className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              All
            </button>
            <button
              onClick={selectOddPages}
              className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Odd
            </button>
            <button
              onClick={selectEvenPages}
              className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Even
            </button>
            <button
              onClick={invertSelection}
              className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Invert
            </button>
            <button
              onClick={clearSelection}
              className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Mode Instruction Hint */}
      <div className="text-[11px] text-slate-400">
        {splitMode === 'range' && (
          <span className="text-brand-300 flex items-center gap-1">
            <CheckSquare className="w-3.5 h-3.5" /> Click any page thumbnail below to select or
            deselect it. The page range input automatically synchronizes with your selection.
          </span>
        )}
        {splitMode === 'fixed' && (
          <span>
            Every <strong className="text-slate-200">{fixedInterval} pages</strong> will be split
            into its own separate file. The colored tags indicate which output file each page will be
            bundled into.
          </span>
        )}
        {splitMode === 'extract_all' && (
          <span>
            Extracts all <strong className="text-slate-200">{pages.length} pages</strong> into
            individual standalone single-page PDF files.
          </span>
        )}
      </div>

      {/* Loading state */}
      {loading && pages.length === 0 && (
        <div className="p-8 text-center bg-slate-950/40 border border-slate-800 rounded-2xl space-y-2">
          <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Rendering document page thumbnails...</p>
        </div>
      )}

      {/* Responsive Page Grid */}
      {pages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[480px] overflow-y-auto p-2 border border-slate-800/80 rounded-2xl bg-slate-950/40">
          {pages.map((p) => {
            const isSelected = selectedPagesSet.has(p.pageNumber);
            const intervalInfo = getIntervalGroupInfo(p.pageNumber);

            return (
              <div
                key={p.pageNumber}
                onClick={() => splitMode === 'range' && togglePageSelection(p.pageNumber)}
                className={`relative group bg-slate-900 border rounded-xl p-2.5 flex flex-col items-center select-none transition-all ${
                  splitMode === 'range' ? 'cursor-pointer' : ''
                } ${
                  splitMode === 'range'
                    ? isSelected
                      ? 'border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/10 scale-[1.02]'
                      : 'border-slate-800 opacity-60 hover:opacity-90 hover:border-slate-700'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Header Tag / Selection Badge */}
                <div className="flex items-center justify-between w-full mb-1.5 px-0.5">
                  <span className="text-[11px] font-bold font-mono text-slate-300">
                    P.{p.pageNumber}
                  </span>

                  {splitMode === 'range' && (
                    <div className="flex items-center">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-brand-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />
                      )}
                    </div>
                  )}

                  {splitMode === 'extract_all' && (
                    <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      File #{p.pageNumber}
                    </span>
                  )}
                </div>

                {/* Page Thumbnail Preview */}
                <div className="w-full aspect-[3/4] bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center border border-slate-800 relative group/thumb my-0.5 shadow-inner">
                  <img
                    src={p.thumbnail}
                    alt={`Page ${p.pageNumber}`}
                    className="w-full h-full object-contain pointer-events-none transition-transform duration-200 group-hover:scale-105"
                  />

                  {/* Zoom Preview Button on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewPage(p.pageNumber);
                    }}
                    className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity text-white"
                    title="Inspect Page in High Resolution"
                  >
                    <div className="p-1.5 rounded-full bg-slate-800/90 border border-slate-700 flex items-center gap-1 text-[10px] font-medium">
                      <ZoomIn className="w-3.5 h-3.5 text-brand-400" /> Inspect
                    </div>
                  </button>
                </div>

                {/* Footer Tag for Fixed Interval mode */}
                {splitMode === 'fixed' && intervalInfo && (
                  <div className="w-full mt-1.5 text-center">
                    <span className="block text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 truncate">
                      {intervalInfo.label}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Enlarged Page Lightbox Preview Modal */}
      {previewPage !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewPage(null)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-white text-sm">
                  Page {previewPage} of {pages.length}
                </span>
                <span className="text-xs text-slate-400 truncate max-w-sm">({file.name})</span>
              </div>
              <button
                onClick={() => setPreviewPage(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Image Display */}
            <div className="max-h-[70vh] flex items-center justify-center bg-slate-950 rounded-xl p-2 border border-slate-800/80 overflow-auto">
              <img
                src={pages.find((p) => p.pageNumber === previewPage)?.thumbnail}
                alt={`Page ${previewPage}`}
                className="max-h-[65vh] w-auto object-contain rounded"
              />
            </div>

            {/* Modal Navigation Footer */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setPreviewPage((prev) => (prev && prev > 1 ? prev - 1 : prev))}
                disabled={previewPage <= 1}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-xs text-slate-200 flex items-center gap-1 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Previous Page
              </button>

              {splitMode === 'range' && (
                <button
                  onClick={() => {
                    togglePageSelection(previewPage);
                  }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    selectedPagesSet.has(previewPage)
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-brand-600 hover:bg-brand-500 text-white'
                  }`}
                >
                  {selectedPagesSet.has(previewPage) ? 'Deselect Page' : 'Select Page for Split'}
                </button>
              )}

              <button
                onClick={() =>
                  setPreviewPage((prev) => (prev && prev < pages.length ? prev + 1 : prev))
                }
                disabled={previewPage >= pages.length}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-xs text-slate-200 flex items-center gap-1 transition-colors"
              >
                Next Page <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
