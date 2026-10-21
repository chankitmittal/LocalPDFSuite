import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useAppStore, showToast } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import {
  EyeOff,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Download,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
  Sparkles,
  MousePointer2,
  X,
} from 'lucide-react';

interface MarkedBox {
  id: string;
  pageNumber: number;
  x: number;       // PDF points (bottom-left origin)
  y: number;       // PDF points (bottom-left origin)
  width: number;   // PDF points
  height: number;  // PDF points
  label?: string;
  // Canvas pixel coordinates for rendering overlay
  canvasX: number;
  canvasY: number;
  canvasW: number;
  canvasH: number;
}

export const RedactionPanel: React.FC = () => {
  const { selectedFile, currentJob } = useAppStore();
  const { callApi, triggerDownload, getBaseUrl } = useSidecar();

  // Mode & Page Navigation
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fillColor, setFillColor] = useState('#000000');

  // Interactive Click & Drag Redaction State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  // All marked redaction boxes across the entire document
  const [redactionBoxes, setRedactionBoxes] = useState<MarkedBox[]>([]);

  // Page geometry from PDF.js
  const [pagePtSize, setPagePtSize] = useState<{ width: number; height: number }>({ width: 595, height: 842 });
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 500, height: 700 });
  const [renderingPage, setRenderingPage] = useState(false);

  // Search & Redact State
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);

  // 1. Load total pages & render current page on canvas
  useEffect(() => {
    if (!selectedFile || !selectedFile.fileObj || !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      return;
    }

    let isCancelled = false;
    setRenderingPage(true);

    const renderPage = async () => {
      try {
        const buffer = await selectedFile.fileObj!.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (isCancelled) return;
        setTotalPages(pdf.numPages);

        const page = await pdf.getPage(currentPage);
        const originalViewport = page.getViewport({ scale: 1.0 });
        setPagePtSize({ width: originalViewport.width, height: originalViewport.height });

        // Target display width: responsive up to 540px
        const targetWidth = Math.min(540, window.innerWidth - 64);
        const scale = targetWidth / originalViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || isCancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setCanvasDimensions({ width: viewport.width, height: viewport.height });

        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;

        if (!isCancelled) {
          setRenderingPage(false);
        }
      } catch (err) {
        console.warn('Failed to render redaction page preview:', err);
        if (!isCancelled) setRenderingPage(false);
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [selectedFile, currentPage]);

  // 2. Mouse Handlers for Visual Click & Drag Selection
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setStartPos({ x, y });
    setDragCurrent({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    setDragCurrent({ x, y });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !startPos || !dragCurrent) {
      setIsDrawing(false);
      setStartPos(null);
      setDragCurrent(null);
      return;
    }

    const cX = Math.min(startPos.x, dragCurrent.x);
    const cY = Math.min(startPos.y, dragCurrent.y);
    const cW = Math.abs(dragCurrent.x - startPos.x);
    const cH = Math.abs(dragCurrent.y - startPos.y);

    // Only create box if user dragged at least 6x6 pixels
    if (cW >= 6 && cH >= 6 && canvasDimensions.width > 0 && canvasDimensions.height > 0) {
      const scaleX = pagePtSize.width / canvasDimensions.width;
      const scaleY = pagePtSize.height / canvasDimensions.height;

      // Convert from screen pixels (top-left origin) to PDF points (bottom-left origin)
      const pdfX = cX * scaleX;
      const pdfY = (canvasDimensions.height - (cY + cH)) * scaleY;
      const pdfW = cW * scaleX;
      const pdfH = cH * scaleY;

      const newBox: MarkedBox = {
        id: `box_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        pageNumber: currentPage,
        x: Math.round(pdfX * 10) / 10,
        y: Math.round(pdfY * 10) / 10,
        width: Math.round(pdfW * 10) / 10,
        height: Math.round(pdfH * 10) / 10,
        canvasX: cX,
        canvasY: cY,
        canvasW: cW,
        canvasH: cH,
        label: `Box on Page ${currentPage}`,
      };

      setRedactionBoxes((prev) => [...prev, newBox]);
    }

    setIsDrawing(false);
    setStartPos(null);
    setDragCurrent(null);
  };

  const removeBox = (id: string) => {
    setRedactionBoxes((prev) => prev.filter((b) => b.id !== id));
  };

  const clearAllBoxes = () => {
    setRedactionBoxes([]);
    setSearchFeedback(null);
  };

  // 3. Search & Redact Backend Execution
  const handleSearchAndRedact = async (queryText?: string, pattern?: string) => {
    if (!selectedFile) {
      showToast('Please upload and select a PDF document first.', 'warning');
      return;
    }

    const q = queryText !== undefined ? queryText : searchQuery;
    if (!pattern && (!q || !q.trim())) {
      showToast('Please enter a search term or select a pattern.', 'warning');
      return;
    }

    setSearching(true);
    setSearchFeedback(null);

    try {
      const resp = await fetch(`${getBaseUrl()}/api/overlays/search-redaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: selectedFile.path,
          query: pattern ? undefined : q.trim(),
          pattern_type: pattern || undefined,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || data.status === 'error') {
        setSearchFeedback(`Search failed: ${data.detail || 'Could not find matches.'}`);
        setSearching(false);
        return;
      }

      const scaleX = canvasDimensions.width / pagePtSize.width;
      const scaleY = canvasDimensions.height / pagePtSize.height;

      const newMarkedBoxes: MarkedBox[] = [];
      let matchCount = 0;

      for (const pageItem of data.results || []) {
        const pNum = pageItem.page_number;
        for (const b of pageItem.boxes) {
          matchCount++;
          // Compute screen canvas approximation for active page
          const cX = b.x * scaleX;
          const cH = b.height * scaleY;
          const cY = canvasDimensions.height - (b.y * scaleY + cH);
          const cW = b.width * scaleX;

          newMarkedBoxes.push({
            id: `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            pageNumber: pNum,
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            label: b.matched_text ? `"${b.matched_text}"` : (pattern ? pattern.toUpperCase() : 'Match'),
            canvasX: cX,
            canvasY: cY,
            canvasW: cW,
            canvasH: cH,
          });
        }
      }

      if (matchCount > 0) {
        setRedactionBoxes((prev) => [...prev, ...newMarkedBoxes]);
        setSearchFeedback(`Found and marked ${matchCount} occurrence(s) across document!`);
        // Navigate to the first page that has a match
        const firstMatchPage = data.results[0]?.page_number;
        if (firstMatchPage && firstMatchPage !== currentPage) {
          setCurrentPage(firstMatchPage);
        }
      } else {
        setSearchFeedback('No matching text or pattern occurrences found.');
      }
    } catch (err: any) {
      setSearchFeedback(`Error searching: ${err.message}`);
    } finally {
      setSearching(false);
    }
  };

  // 4. Submit Final Irreversible Redaction to Backend
  const handleApplyRedaction = async () => {
    if (!selectedFile) {
      showToast('Please upload and select a PDF file first.', 'warning');
      return;
    }

    if (redactionBoxes.length === 0) {
      showToast('Please mark at least one area to redact (by click-and-drag or search).', 'warning');
      return;
    }

    // Group by page number
    const pageMap: { [key: number]: any[] } = {};
    for (const b of redactionBoxes) {
      if (!pageMap[b.pageNumber]) {
        pageMap[b.pageNumber] = [];
      }
      pageMap[b.pageNumber].push({
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
      });
    }

    const payloadRedactions = Object.keys(pageMap).map((pageNumStr) => ({
      page_number: Number(pageNumStr),
      boxes: pageMap[Number(pageNumStr)],
    }));

    await callApi('/api/overlays/redact', {
      file_path: selectedFile.path,
      redactions: payloadRedactions,
      fill_color: fillColor,
      output_filename: `sanitized_${selectedFile.name}`,
    });
  };

  // Filter boxes for currently viewed page
  const currentPageBoxes = redactionBoxes.filter((b) => b.pageNumber === currentPage);

  // Compute live drawing box geometry for the in-progress drag
  const activeDragBox = isDrawing && startPos && dragCurrent ? {
    left: Math.min(startPos.x, dragCurrent.x),
    top: Math.min(startPos.y, dragCurrent.y),
    width: Math.abs(dragCurrent.x - startPos.x),
    height: Math.abs(dragCurrent.y - startPos.y),
  } : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <EyeOff className="w-5 h-5 text-pdfred-500" />
          Interactive Visual Redaction Suite
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Click & drag directly on the document page, or use Search & Redact to auto-censor words, SSNs, and emails.
        </p>
      </div>

      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
        <p>
          <strong>True Irreversible Sanitization:</strong> Marked regions are permanently wiped from the underlying raster pixels and text stream. Text underneath is completely destroyed and 100% immune to Ctrl+F.
        </p>
      </div>

      {/* Search & Auto-Redact Bar */}
      <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-200">
          <span className="font-semibold flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-brand-400" />
            Search & Auto-Redact Across All Pages
          </span>
          <span className="text-slate-400 text-[11px]">Auto-calculates exact coordinates</span>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchAndRedact()}
              placeholder="Search keyword or phrase (e.g. 'CONFIDENTIAL', 'Account 1234')..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            />
          </div>
          <button
            onClick={() => handleSearchAndRedact()}
            disabled={searching || !selectedFile}
            className="py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors flex-shrink-0"
          >
            {searching ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            <span>Find & Mark</span>
          </button>
        </div>

        {/* Preset Pattern Buttons */}
        <div className="flex items-center gap-2 flex-wrap pt-1 text-xs">
          <span className="text-[11px] text-slate-400">Quick Patterns:</span>
          <button
            onClick={() => handleSearchAndRedact(undefined, 'ssn')}
            disabled={searching || !selectedFile}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-brand-600/30 hover:border-brand-500/50 border border-slate-700 text-slate-300 text-[11px] font-medium transition-colors"
          >
            SSN / Tax ID
          </button>
          <button
            onClick={() => handleSearchAndRedact(undefined, 'email')}
            disabled={searching || !selectedFile}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-brand-600/30 hover:border-brand-500/50 border border-slate-700 text-slate-300 text-[11px] font-medium transition-colors"
          >
            Email Addresses
          </button>
          <button
            onClick={() => handleSearchAndRedact(undefined, 'credit_card')}
            disabled={searching || !selectedFile}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-brand-600/30 hover:border-brand-500/50 border border-slate-700 text-slate-300 text-[11px] font-medium transition-colors"
          >
            Credit Card #
          </button>
          <button
            onClick={() => handleSearchAndRedact(undefined, 'phone')}
            disabled={searching || !selectedFile}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-brand-600/30 hover:border-brand-500/50 border border-slate-700 text-slate-300 text-[11px] font-medium transition-colors"
          >
            Phone Numbers
          </button>
        </div>

        {searchFeedback && (
          <div className="text-xs text-brand-400 bg-brand-500/10 border border-brand-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{searchFeedback}</span>
          </div>
        )}
      </div>

      {/* Main Visual Working Area: Canvas on Left, Queue on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Visual Document Viewer & Click-and-Drag Area (8 cols) */}
        <div className="lg:col-span-8 bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col items-center space-y-3">
          {/* Navigation Bar */}
          <div className="w-full flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center space-x-2 text-xs">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <MousePointer2 className="w-3.5 h-3.5 text-brand-400" />
                Draw Directly on Page
              </span>
              <span className="text-[11px] text-slate-400">
                ({currentPageBoxes.length} marked on this page)
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-mono font-semibold text-slate-300 px-2">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Page Container */}
          <div className="w-full flex justify-center py-2 overflow-x-auto">
            <div
              ref={overlayRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="relative shadow-2xl rounded-lg overflow-hidden border border-slate-700 bg-white cursor-crosshair select-none"
              style={{
                width: `${canvasDimensions.width}px`,
                height: `${canvasDimensions.height}px`,
              }}
            >
              {/* Underlying rendered PDF page */}
              <canvas
                ref={canvasRef}
                className="block pointer-events-none"
                style={{ width: `${canvasDimensions.width}px`, height: `${canvasDimensions.height}px` }}
              />

              {/* Existing marked redaction boxes on this page */}
              {currentPageBoxes.map((box) => {
                const scaleX = canvasDimensions.width / pagePtSize.width;
                const scaleY = canvasDimensions.height / pagePtSize.height;

                const cX = box.x * scaleX;
                const cH = box.height * scaleY;
                const cY = canvasDimensions.height - (box.y * scaleY + cH);
                const cW = box.width * scaleX;

                return (
                  <div
                    key={box.id}
                    className="absolute border-2 border-red-500 bg-red-600/35 group flex items-start justify-end p-0.5 rounded-xs transition-colors hover:bg-red-600/50 pointer-events-auto"
                    style={{
                      left: `${cX}px`,
                      top: `${cY}px`,
                      width: `${cW}px`,
                      height: `${cH}px`,
                    }}
                    title={`Redacted: ${box.label || 'Marked Region'}`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBox(box.id);
                      }}
                      className="p-0.5 bg-red-700 hover:bg-red-800 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity shadow"
                      title="Remove this redaction box"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}

              {/* Dynamic in-progress drag rectangle */}
              {activeDragBox && (
                <div
                  className="absolute border-2 border-dashed border-red-500 bg-red-500/40 pointer-events-none"
                  style={{
                    left: `${activeDragBox.left}px`,
                    top: `${activeDragBox.top}px`,
                    width: `${activeDragBox.width}px`,
                    height: `${activeDragBox.height}px`,
                  }}
                />
              )}

              {renderingPage && (
                <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center text-xs text-brand-400">
                  <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin mr-2" />
                  Rendering Page {currentPage}...
                </div>
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-400 text-center">
            Click & drag over any sensitive text or area above to mark it for redaction.
          </div>
        </div>

        {/* Redaction Queue & Options (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-200">
              <span className="font-semibold">Marked Redactions ({redactionBoxes.length})</span>
              {redactionBoxes.length > 0 && (
                <button
                  onClick={clearAllBoxes}
                  className="text-slate-400 hover:text-red-400 text-[11px] transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* List of marked boxes */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 text-xs">
              {redactionBoxes.map((b, idx) => (
                <div
                  key={b.id}
                  onClick={() => setCurrentPage(b.pageNumber)}
                  className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                    b.pageNumber === currentPage
                      ? 'bg-red-500/10 border-red-500/30 text-red-200'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="truncate mr-2">
                    <span className="font-mono text-[10px] text-slate-400 mr-1.5">P.{b.pageNumber}</span>
                    <span className="font-medium truncate">{b.label || `Box #${idx + 1}`}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBox(b.id);
                    }}
                    className="p-1 text-slate-400 hover:text-red-400 rounded transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {redactionBoxes.length === 0 && (
                <div className="p-6 text-center text-slate-500 text-xs">
                  No areas marked yet. Click and drag on the page preview, or search for keywords above.
                </div>
              )}
            </div>

            {/* Fill Color */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300">
              <span>Sanitization Color:</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setFillColor('#000000')}
                  className={`w-6 h-6 rounded-md bg-black border ${
                    fillColor === '#000000' ? 'border-brand-500 ring-2 ring-brand-500/40' : 'border-slate-700'
                  }`}
                  title="Black (Standard Censor Bar)"
                />
                <button
                  onClick={() => setFillColor('#ffffff')}
                  className={`w-6 h-6 rounded-md bg-white border ${
                    fillColor === '#ffffff' ? 'border-brand-500 ring-2 ring-brand-500/40' : 'border-slate-700'
                  }`}
                  title="White (Clean Removal)"
                />
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handleApplyRedaction}
            disabled={!selectedFile || redactionBoxes.length === 0 || currentJob.status === 'running'}
            className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-pdfred-600 hover:bg-pdfred-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-pdfred-600/20 transition-all flex items-center justify-center gap-2"
          >
            <EyeOff className="w-4 h-4" />
            {currentJob.status === 'running'
              ? 'Permanently Sanitizing Document...'
              : `Apply Redaction (${redactionBoxes.length} Marked)`}
          </button>
        </div>
      </div>

      {/* Result feedback */}
      {currentJob.status === 'success' && currentJob.downloadUrl && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-emerald-400 text-xs">
            <CheckCircle className="w-4 h-4" />
            <span className="font-semibold text-sm">Document Redacted & Sanitized Successfully!</span>
          </div>
          <button
            onClick={() => triggerDownload(currentJob.downloadUrl!)}
            className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md"
          >
            <Download className="w-3.5 h-3.5" /> Save Redacted PDF
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
