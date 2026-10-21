import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import {
  CompareAnalysisResult,
  ComparePageSummary,
  ComparePageRenderResult,
  ComparePageChange,
} from '../../types';
import {
  GitCompare,
  ArrowLeftRight,
  Columns,
  MoveHorizontal,
  Zap,
  AlignLeft,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  MinusCircle,
  ZoomIn,
  ZoomOut,
  Lock,
  Unlock,
  PanelRight,
  PanelRightClose,
  ShieldCheck,
  Eye,
  Sliders,
} from 'lucide-react';

export const ComparePanel: React.FC = () => {
  const { files } = useAppStore();
  const { callApi, triggerDownload, getBaseUrl } = useSidecar();

  // Filter only PDF files
  const pdfFiles = useMemo(
    () => files.filter((f) => f.name.toLowerCase().endsWith('.pdf')),
    [files]
  );

  // Selected Documents
  const [docAId, setDocAId] = useState<string>('');
  const [docBId, setDocBId] = useState<string>('');

  // Auto-assign first two PDFs if available
  useEffect(() => {
    if (pdfFiles.length >= 2) {
      if (!docAId || !pdfFiles.some((f) => f.id === docAId)) {
        setDocAId(pdfFiles[0].id);
      }
      if (!docBId || !pdfFiles.some((f) => f.id === docBId) || docBId === pdfFiles[0].id) {
        setDocBId(pdfFiles[1].id);
      }
    } else if (pdfFiles.length === 1) {
      if (!docAId) setDocAId(pdfFiles[0].id);
    }
  }, [pdfFiles]);

  const docA = pdfFiles.find((f) => f.id === docAId);
  const docB = pdfFiles.find((f) => f.id === docBId);

  // View Mode:
  // - 'split': Side-by-side synchronized view with word-level highlight capsules
  // - 'swipe': Interactive before/after curtain slider (Bluebeam / CAD standard)
  // - 'blink': Optical flicker comparison (toggles Doc A and B at 2Hz)
  // - 'text': Structured clause-by-clause diff
  const [viewMode, setViewMode] = useState<'split' | 'swipe' | 'blink' | 'text'>('split');

  // Annotation display toggle (draftable-style pills on/off)
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);

  // Synchronized scroll lock in Side-by-Side view
  const [syncScroll, setSyncScroll] = useState<boolean>(true);
  const scrollContainerA = useRef<HTMLDivElement>(null);
  const scrollContainerB = useRef<HTMLDivElement>(null);
  const isScrollingSyncRef = useRef<boolean>(false);

  // Interactive Swipe Curtain Slider state (0% to 100%)
  const [swipePosition, setSwipePosition] = useState<number>(50);
  const isDraggingSliderRef = useRef<boolean>(false);
  const swipeContainerRef = useRef<HTMLDivElement>(null);

  // Optical Blink comparison state
  const [isBlinking, setIsBlinking] = useState<boolean>(false);
  const [activeBlinkDoc, setActiveBlinkDoc] = useState<'A' | 'B'>('B');
  const [isHoldingPeek, setIsHoldingPeek] = useState<boolean>(false);

  // Active page navigation & zoom
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Comparison State
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<CompareAnalysisResult | null>(null);

  // Page Render Cache (maps pageNumber to rendered base64 images + word diffs)
  const [pageRenders, setPageRenders] = useState<Record<number, ComparePageRenderResult>>({});
  const [loadingPageRender, setLoadingPageRender] = useState<boolean>(false);

  // Changes Drawer & Selected Change
  const [showChangesDrawer, setShowChangesDrawer] = useState<boolean>(true);
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);

  // Export report state
  const [exportingReport, setExportingReport] = useState<boolean>(false);

  // Swap Documents
  const handleSwapDocs = () => {
    setDocAId(docBId);
    setDocBId(docAId);
    setAnalysisResult(null);
    setPageRenders({});
    setCurrentPage(1);
    setSelectedChangeId(null);
  };

  // Run Document Comparison Analysis
  const runComparison = useCallback(async () => {
    if (!docA || !docB) return;
    setAnalyzing(true);
    setAnalysisResult(null);
    setPageRenders({});
    setCurrentPage(1);
    setSelectedChangeId(null);

    try {
      const resp = await fetch(`${getBaseUrl()}/api/compare/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_a_path: docA.path,
          doc_b_path: docB.path,
          quick_visual_check: true,
        }),
      });

      if (resp.ok) {
        const res: CompareAnalysisResult = await resp.json();
        if (res && res.status === 'success') {
          setAnalysisResult(res);
        }
      }
    } catch (err) {
      console.error('Error analyzing document comparison:', err);
    } finally {
      setAnalyzing(false);
    }
  }, [docA, docB, getBaseUrl]);

  // Auto-run analysis when documents change
  useEffect(() => {
    if (docA && docB && docA.id !== docB.id) {
      runComparison();
    }
  }, [docA?.id, docB?.id, runComparison]);

  // Fetch Page Visual Diff for active page
  useEffect(() => {
    if (!docA || !docB || !analysisResult) return;
    if (pageRenders[currentPage]) return; // already cached

    let isMounted = true;
    setLoadingPageRender(true);

    fetch(`${getBaseUrl()}/api/compare/render-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc_a_path: docA.path,
        doc_b_path: docB.path,
        page_number: currentPage,
        dpi: 140,
      }),
    })
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((res: ComparePageRenderResult | null) => {
        if (isMounted && res && res.status === 'success') {
          setPageRenders((prev) => {
            const next: Record<number, ComparePageRenderResult> = { ...prev, [currentPage]: res };
            // Sliding window eviction: retain only 5 pages around currentPage to prevent heap bloat
            const minKeep = currentPage - 2;
            const maxKeep = currentPage + 2;
            for (const key of Object.keys(next)) {
              const p = Number(key);
              if (p < minKeep || p > maxKeep) {
                delete next[p];
              }
            }
            return next;
          });
        }
      })
      .catch((err) => {
        console.error(`Error rendering page ${currentPage} diff:`, err);
      })
      .finally(() => {
        if (isMounted) setLoadingPageRender(false);
      });

    return () => {
      isMounted = false;
    };
  }, [docA, docB, analysisResult, currentPage, pageRenders, getBaseUrl]);

  // Active page summary metadata
  const activePageSummary: ComparePageSummary | undefined = useMemo(() => {
    if (!analysisResult) return undefined;
    return analysisResult.pages.find((p) => p.page_number === currentPage);
  }, [analysisResult, currentPage]);

  const activePageRender = pageRenders[currentPage];

  // Active page change items
  const activeChanges: ComparePageChange[] = useMemo(() => {
    if (activePageRender?.changes && activePageRender.changes.length > 0) {
      return activePageRender.changes;
    }
    return activePageSummary?.changes || [];
  }, [activePageRender, activePageSummary]);

  // All modified pages
  const modifiedPages = useMemo(() => {
    if (!analysisResult) return [];
    return analysisResult.pages.filter((p) => p.status !== 'identical').map((p) => p.page_number);
  }, [analysisResult]);

  // Synchronized Scrolling handler between left and right pane
  const handleScrollA = () => {
    if (!syncScroll || isScrollingSyncRef.current) return;
    isScrollingSyncRef.current = true;
    if (scrollContainerA.current && scrollContainerB.current) {
      const elA = scrollContainerA.current;
      const elB = scrollContainerB.current;
      const maxScrollA = elA.scrollHeight - elA.clientHeight;
      const maxScrollB = elB.scrollHeight - elB.clientHeight;
      if (maxScrollA > 0 && maxScrollB > 0) {
        const ratio = elA.scrollTop / maxScrollA;
        elB.scrollTop = ratio * maxScrollB;
      }
    }
    setTimeout(() => {
      isScrollingSyncRef.current = false;
    }, 25);
  };

  const handleScrollB = () => {
    if (!syncScroll || isScrollingSyncRef.current) return;
    isScrollingSyncRef.current = true;
    if (scrollContainerA.current && scrollContainerB.current) {
      const elA = scrollContainerA.current;
      const elB = scrollContainerB.current;
      const maxScrollA = elA.scrollHeight - elA.clientHeight;
      const maxScrollB = elB.scrollHeight - elB.clientHeight;
      if (maxScrollA > 0 && maxScrollB > 0) {
        const ratio = elB.scrollTop / maxScrollB;
        elA.scrollTop = ratio * maxScrollA;
      }
    }
    setTimeout(() => {
      isScrollingSyncRef.current = false;
    }, 25);
  };

  // Optical Blink interval (flickers Doc A and Doc B at ~1.5Hz)
  useEffect(() => {
    if (!isBlinking) return;
    const interval = setInterval(() => {
      setActiveBlinkDoc((prev) => (prev === 'A' ? 'B' : 'A'));
    }, 650);
    return () => clearInterval(interval);
  }, [isBlinking]);

  // Swipe Curtain Drag handlers
  const handleSwipeMove = (clientX: number) => {
    if (!swipeContainerRef.current) return;
    const rect = swipeContainerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSwipePosition(Math.round(pct * 10) / 10);
  };

  const handleMouseDownSlider = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSliderRef.current = true;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (isDraggingSliderRef.current) {
        handleSwipeMove(moveEvent.clientX);
      }
    };

    const onMouseUp = () => {
      isDraggingSliderRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Navigation: Jump to Change & Focus
  const handleSelectChange = (change: ComparePageChange) => {
    setSelectedChangeId(change.id);
    if (change.page_number !== currentPage) {
      setCurrentPage(change.page_number);
    }

    // Scroll panes to center the change
    setTimeout(() => {
      const targetPct = change.box_b?.y ?? change.box_a?.y ?? 50;
      if (scrollContainerA.current) {
        const el = scrollContainerA.current;
        el.scrollTo({
          top: (targetPct / 100) * el.scrollHeight - el.clientHeight / 2,
          behavior: 'smooth',
        });
      }
      if (scrollContainerB.current) {
        const el = scrollContainerB.current;
        el.scrollTo({
          top: (targetPct / 100) * el.scrollHeight - el.clientHeight / 2,
          behavior: 'smooth',
        });
      }
    }, 60);
  };

  // Step through changes sequentially
  const handleNextDifference = () => {
    if (activeChanges.length > 0) {
      const currIdx = activeChanges.findIndex((c) => c.id === selectedChangeId);
      if (currIdx >= 0 && currIdx < activeChanges.length - 1) {
        handleSelectChange(activeChanges[currIdx + 1]);
        return;
      }
    }
    // Jump to next modified page
    const nextPg = modifiedPages.find((p) => p > currentPage);
    if (nextPg) {
      setCurrentPage(nextPg);
      setSelectedChangeId(null);
    } else if (modifiedPages.length > 0) {
      setCurrentPage(modifiedPages[0]);
      setSelectedChangeId(null);
    }
  };

  const handlePrevDifference = () => {
    if (activeChanges.length > 0) {
      const currIdx = activeChanges.findIndex((c) => c.id === selectedChangeId);
      if (currIdx > 0) {
        handleSelectChange(activeChanges[currIdx - 1]);
        return;
      }
    }
    // Jump to prev modified page
    const prevPg = [...modifiedPages].reverse().find((p) => p < currentPage);
    if (prevPg) {
      setCurrentPage(prevPg);
      setSelectedChangeId(null);
    } else if (modifiedPages.length > 0) {
      setCurrentPage(modifiedPages[modifiedPages.length - 1]);
      setSelectedChangeId(null);
    }
  };

  // Export Full PDF Comparison Report
  const handleExportReport = async () => {
    if (!docA || !docB) return;
    setExportingReport(true);
    try {
      const res = await callApi('/api/compare/export-report', {
        doc_a_path: docA.path,
        doc_b_path: docB.path,
        output_filename: `comparison_report_${Date.now()}.pdf`,
      });

      if (res && res.output_path) {
        triggerDownload(
          `${getBaseUrl()}/api/files/download?path=${encodeURIComponent(res.output_path)}`,
          `comparison_report_${docA.name.replace(/\.pdf$/i, '')}_vs_${docB.name.replace(/\.pdf$/i, '')}.pdf`
        );
      }
    } catch (err) {
      console.error('Error generating comparison report:', err);
    } finally {
      setExportingReport(false);
    }
  };

  // Guard: If less than 2 PDF documents are loaded
  if (pdfFiles.length < 2) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center max-w-2xl mx-auto shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-brand-500/10 text-brand-400 mx-auto flex items-center justify-center mb-5 border border-brand-500/20 shadow-inner">
          <GitCompare className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Compare Two PDF Documents</h2>
        <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
          Please upload at least 2 PDF documents (e.g. an original contract and a revised draft) to compare them
          using word-level inline strike-throughs, synchronized side-by-side inspection, and interactive swipe sliders.
        </p>
        <div className="inline-flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 rounded-full font-medium">
          <ShieldCheck className="w-4 h-4" /> 100% Offline & Private &bull; Zero External Data Transmission
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Header Document Selection Bar */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-3.5 shadow-xl backdrop-blur-md">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
          {/* Document A Selector */}
          <div className="flex-1 w-full flex items-center gap-3 bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-xs shrink-0">
              Doc A
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase font-bold tracking-wider text-rose-400/90 flex items-center gap-1">
                Baseline (Original)
              </div>
              <select
                value={docAId}
                onChange={(e) => setDocAId(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-slate-100 truncate focus:outline-none cursor-pointer"
              >
                {pdfFiles.map((file) => (
                  <option key={`a_${file.id}`} value={file.id} className="bg-slate-900 text-slate-200">
                    {file.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Swap Documents Button */}
          <button
            onClick={handleSwapDocs}
            title="Swap Document A and Document B"
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700 shadow-md shrink-0 active:scale-95"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>

          {/* Document B Selector */}
          <div className="flex-1 w-full flex items-center gap-3 bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs shrink-0">
              Doc B
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase font-bold tracking-wider text-sky-400/90 flex items-center gap-1">
                Revised (New Version)
              </div>
              <select
                value={docBId}
                onChange={(e) => setDocBId(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-slate-100 truncate focus:outline-none cursor-pointer"
              >
                {pdfFiles.map((file) => (
                  <option key={`b_${file.id}`} value={file.id} className="bg-slate-900 text-slate-200">
                    {file.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Re-Analyze Button */}
          <button
            onClick={runComparison}
            disabled={analyzing}
            className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium text-xs flex items-center gap-2 shadow-lg shadow-brand-500/20 transition active:scale-95 disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
            {analyzing ? 'Comparing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* 2. Executive Metrics Summary Bar */}
      {analysisResult && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-3 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: Overall Match & Badges */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs text-slate-400">Match Score:</span>
                <span
                  className={`text-sm font-extrabold ${
                    analysisResult.similarity_score >= 95
                      ? 'text-emerald-400'
                      : analysisResult.similarity_score >= 80
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {analysisResult.similarity_score}%
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {analysisResult.identical_pages_count} Identical
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {analysisResult.modified_pages_count} Modified
                </span>
                {analysisResult.added_pages_count > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center gap-1">
                    <PlusCircle className="w-3.5 h-3.5" />
                    +{analysisResult.added_pages_count} Added
                  </span>
                )}
                {analysisResult.deleted_pages_count > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-1">
                    <MinusCircle className="w-3.5 h-3.5" />
                    -{analysisResult.deleted_pages_count} Deleted
                  </span>
                )}
              </div>

              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 border-l border-slate-800 pl-3">
                <span className="text-sky-400 font-mono font-medium">+{analysisResult.total_added_words} words</span>
                <span>/</span>
                <span className="text-rose-400 font-mono font-medium">-{analysisResult.total_deleted_words} words</span>
              </div>
            </div>

            {/* Right: Export Report Button */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportReport}
                disabled={exportingReport}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 shadow transition active:scale-95 disabled:opacity-50"
              >
                <Download className={`w-3.5 h-3.5 ${exportingReport ? 'animate-bounce' : ''}`} />
                {exportingReport ? 'Building PDF Report...' : 'Export Diff Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Viewer Toolbar & Mode Switcher */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5">
        {/* Mode Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setViewMode('split')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              viewMode === 'split' ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Side-by-Side synchronized view with Draftable-style word highlights"
          >
            <Columns className="w-3.5 h-3.5" /> Side-by-Side
          </button>
          <button
            onClick={() => setViewMode('swipe')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              viewMode === 'swipe' ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Draggable Before/After curtain slider for diagrams and text"
          >
            <MoveHorizontal className="w-3.5 h-3.5" /> Swipe Curtain
          </button>
          <button
            onClick={() => setViewMode('blink')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              viewMode === 'blink' ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Optical flicker mode: rapidly alternates Doc A and B to spot differences naturally"
          >
            <Zap className="w-3.5 h-3.5" /> Blink Mode
          </button>
          <button
            onClick={() => setViewMode('text')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              viewMode === 'text' ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Line-by-line semantic clause diff"
          >
            <AlignLeft className="w-3.5 h-3.5" /> Text Diff
          </button>
        </div>

        {/* View Options & Change Stepper */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Side-by-Side Sync Scroll Toggle */}
          {viewMode === 'split' && (
            <button
              onClick={() => setSyncScroll(!syncScroll)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${
                syncScroll
                  ? 'bg-slate-800 border-slate-700 text-brand-300'
                  : 'bg-slate-950 border-slate-800 text-slate-500'
              }`}
              title="Lock/unlock synchronized scrolling between Document A and Document B"
            >
              {syncScroll ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              <span>Sync Scroll</span>
            </button>
          )}

          {/* Highlight Pills Toggle */}
          {viewMode === 'split' && (
            <button
              onClick={() => setShowAnnotations(!showAnnotations)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${
                showAnnotations
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-slate-950 border-slate-800 text-slate-500'
              }`}
              title="Toggle inline red/green word highlight capsules"
            >
              <Eye className="w-3 h-3" />
              <span>Word Pills: {showAnnotations ? 'ON' : 'OFF'}</span>
            </button>
          )}

          {/* Change Stepper Buttons */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 gap-1">
            <span className="text-[11px] text-slate-400 px-1 font-medium">Step:</span>
            <button
              onClick={handlePrevDifference}
              title="Previous Difference"
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono text-amber-400 px-1">
              {activeChanges.length > 0
                ? `${selectedChangeId ? activeChanges.findIndex((c) => c.id === selectedChangeId) + 1 : 1}/${activeChanges.length}`
                : `${modifiedPages.length} changed pgs`}
            </span>
            <button
              onClick={handleNextDifference}
              title="Next Difference"
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Page Navigator */}
          {analysisResult && (
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 gap-1">
              <button
                onClick={() => {
                  setCurrentPage((p) => Math.max(1, p - 1));
                  setSelectedChangeId(null);
                }}
                disabled={currentPage <= 1}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded disabled:opacity-30 transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-mono text-slate-200 px-1">
                P. {currentPage}/{analysisResult.max_pages}
              </span>
              <button
                onClick={() => {
                  setCurrentPage((p) => Math.min(analysisResult.max_pages, p + 1));
                  setSelectedChangeId(null);
                }}
                disabled={currentPage >= analysisResult.max_pages}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded disabled:opacity-30 transition"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Zoom Controls */}
          {viewMode !== 'text' && (
            <div className="hidden lg:flex items-center bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 gap-1">
              <button
                onClick={() => setZoomLevel((z) => Math.max(50, z - 15))}
                className="p-1 text-slate-400 hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-mono text-slate-300 w-9 text-center">{zoomLevel}%</span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(200, z + 15))}
                className="p-1 text-slate-400 hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Toggle Changes Drawer */}
          <button
            onClick={() => setShowChangesDrawer(!showChangesDrawer)}
            className={`p-1.5 rounded-xl border text-xs font-medium transition ${
              showChangesDrawer
                ? 'bg-slate-800 border-slate-700 text-brand-300'
                : 'bg-slate-950 border-slate-800 text-slate-500'
            }`}
            title="Toggle Changes Inspector Drawer"
          >
            {showChangesDrawer ? <PanelRightClose className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 4. Main Body: Comparison Viewer + Changes Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Main Viewer Canvas */}
        <div className={`${showChangesDrawer ? 'lg:col-span-8 xl:col-span-9' : 'lg:col-span-12'} space-y-4`}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 min-h-[560px] flex flex-col justify-center items-center shadow-inner relative overflow-hidden">
            {/* Loading Spinner */}
            {loadingPageRender && !activePageRender && (
              <div className="flex flex-col items-center gap-3 py-20 text-slate-400 m-auto">
                <RefreshCw className="w-8 h-8 animate-spin text-brand-500" />
                <p className="text-sm font-medium">Extracting word-level coordinates and rendering diff...</p>
              </div>
            )}

            {/* ── Mode 1: Side-by-Side Synchronized View (Draftable Standard) ── */}
            {viewMode === 'split' && activePageRender && (
              <div className="w-full space-y-3">
                {/* Visual Legend */}
                <div className="flex flex-wrap items-center justify-between text-xs bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800 text-slate-300">
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-slate-400">Word-Level Legend:</span>
                    <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                      <span className="w-3.5 h-3 rounded bg-rose-500/30 border border-rose-500 inline-block" />
                      Red strike-through = deleted from Doc A
                    </span>
                    <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                      <span className="w-3.5 h-3 rounded bg-emerald-500/30 border border-emerald-500 inline-block" />
                      Green capsule = added in Doc B
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {syncScroll ? 'Lockstep scrolling active' : 'Independent scrolling'}
                  </div>
                </div>

                {/* Dual Panes */}
                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Pane: Document A (Baseline) */}
                  <div className="flex flex-col bg-slate-950/70 rounded-xl border-2 border-rose-900/40 overflow-hidden shadow-lg">
                    <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800 text-xs bg-slate-900/90">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                        <span className="font-bold text-rose-300">Doc A &bull; Baseline</span>
                        <span className="text-slate-500 font-mono text-[11px]">P. {currentPage}</span>
                      </div>
                      <span className="text-slate-400 truncate max-w-[160px] text-[11px]">{docA?.name}</span>
                    </div>

                    <div
                      ref={scrollContainerA}
                      onScroll={handleScrollA}
                      className="overflow-auto flex justify-center p-3"
                      style={{ maxHeight: '68vh' }}
                    >
                      {activePageRender.img_a ? (
                        <div className="relative inline-block">
                          <img
                            src={
                              showAnnotations && activePageRender.img_a_annotated
                                ? activePageRender.img_a_annotated
                                : activePageRender.img_a
                            }
                            alt={`Doc A Page ${currentPage}`}
                            style={{ width: `${zoomLevel}%`, maxWidth: 'none' }}
                            className="rounded-md shadow-2xl border border-slate-700"
                          />
                        </div>
                      ) : (
                        <div className="py-20 text-center text-slate-500 italic text-xs">
                          Page was added in Document B
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Pane: Document B (Revised) */}
                  <div className="flex flex-col bg-slate-950/70 rounded-xl border-2 border-emerald-900/40 overflow-hidden shadow-lg">
                    <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800 text-xs bg-slate-900/90">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                        <span className="font-bold text-emerald-300">Doc B &bull; Revised</span>
                        <span className="text-slate-500 font-mono text-[11px]">P. {currentPage}</span>
                      </div>
                      <span className="text-slate-400 truncate max-w-[160px] text-[11px]">{docB?.name}</span>
                    </div>

                    <div
                      ref={scrollContainerB}
                      onScroll={handleScrollB}
                      className="overflow-auto flex justify-center p-3"
                      style={{ maxHeight: '68vh' }}
                    >
                      {activePageRender.img_b ? (
                        <div className="relative inline-block">
                          <img
                            src={
                              showAnnotations && activePageRender.img_b_annotated
                                ? activePageRender.img_b_annotated
                                : activePageRender.img_b
                            }
                            alt={`Doc B Page ${currentPage}`}
                            style={{ width: `${zoomLevel}%`, maxWidth: 'none' }}
                            className="rounded-md shadow-2xl border border-slate-700"
                          />
                        </div>
                      ) : (
                        <div className="py-20 text-center text-slate-500 italic text-xs">
                          Page was deleted from Document A
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Mode 2: Interactive Swipe Curtain Slider (Bluebeam / CAD Standard) ── */}
            {viewMode === 'swipe' && activePageRender && (
              <div className="w-full flex flex-col items-center space-y-3">
                {/* Swipe Toolbar & Presets */}
                <div className="w-full flex flex-wrap items-center justify-between text-xs bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800 text-slate-300">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="text-rose-400">◄ Left: Doc A (Baseline)</span>
                    <span className="text-slate-600">&bull;</span>
                    <span className="text-sky-400">Right: Doc B (Revised) ►</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Split: {swipePosition}%</span>
                    <button
                      onClick={() => setSwipePosition(25)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px]"
                    >
                      25%
                    </button>
                    <button
                      onClick={() => setSwipePosition(50)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px]"
                    >
                      50%
                    </button>
                    <button
                      onClick={() => setSwipePosition(75)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px]"
                    >
                      75%
                    </button>
                  </div>
                </div>

                {/* Swipe Canvas View */}
                <div
                  ref={swipeContainerRef}
                  onClick={(e) => handleSwipeMove(e.clientX)}
                  className="relative select-none overflow-hidden rounded-xl border border-slate-700 shadow-2xl bg-slate-950/70 flex justify-center cursor-ew-resize"
                  style={{ maxHeight: '72vh' }}
                >
                  {activePageRender.img_b && activePageRender.img_a ? (
                    <div className="relative inline-block" style={{ width: `${zoomLevel}%` }}>
                      {/* Base Image: Document B (Revised) */}
                      <img
                        src={activePageRender.img_b}
                        alt="Doc B Revised"
                        className="w-full block pointer-events-none"
                      />

                      {/* Overlaid Image: Document A (Baseline) clipped by swipePosition */}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          clipPath: `inset(0 ${100 - swipePosition}% 0 0)`,
                        }}
                      >
                        <img
                          src={activePageRender.img_a}
                          alt="Doc A Baseline"
                          className="w-full block"
                        />
                      </div>

                      {/* Draggable Divider Line & Grip Handle */}
                      <div
                        onMouseDown={handleMouseDownSlider}
                        className="absolute top-0 bottom-0 z-30 cursor-ew-resize flex items-center justify-center pointer-events-auto"
                        style={{ left: `${swipePosition}%`, transform: 'translateX(-50%)' }}
                      >
                        <div className="w-0.5 h-full bg-brand-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                        <div className="absolute w-7 h-7 rounded-full bg-slate-900 border-2 border-brand-500 text-white flex items-center justify-center shadow-2xl hover:scale-110 transition active:scale-95">
                          <MoveHorizontal className="w-3.5 h-3.5 text-brand-400" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-20 text-slate-500">Page does not exist in both documents.</div>
                  )}
                </div>
              </div>
            )}

            {/* ── Mode 3: Optical Blink / Flicker Mode ── */}
            {viewMode === 'blink' && activePageRender && (
              <div className="w-full flex flex-col items-center space-y-4">
                {/* Blink Controls */}
                <div className="flex flex-wrap items-center gap-4 text-xs bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-800 text-slate-300">
                  <button
                    onClick={() => setIsBlinking(!isBlinking)}
                    className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition ${
                      isBlinking ? 'bg-amber-500 text-slate-950 shadow-lg' : 'bg-slate-800 text-slate-200 hover:text-white'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {isBlinking ? 'Stop Auto-Blink' : 'Start Auto-Blink (1.5 Hz)'}
                  </button>

                  <button
                    onMouseDown={() => setIsHoldingPeek(true)}
                    onMouseUp={() => setIsHoldingPeek(false)}
                    onMouseLeave={() => setIsHoldingPeek(false)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold select-none active:bg-rose-600 active:text-white transition"
                  >
                    Hold to View Original (Doc A)
                  </button>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">Viewing:</span>
                    <span
                      className={`font-mono font-bold px-2 py-0.5 rounded ${
                        (isHoldingPeek || (!isBlinking && activeBlinkDoc === 'A') || (isBlinking && activeBlinkDoc === 'A'))
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      }`}
                    >
                      {(isHoldingPeek || (!isBlinking && activeBlinkDoc === 'A') || (isBlinking && activeBlinkDoc === 'A'))
                        ? 'DOC A (BASELINE)'
                        : 'DOC B (REVISED)'}
                    </span>
                  </div>
                </div>

                {/* Blink Viewer Container */}
                <div
                  className="max-w-full overflow-auto p-4 flex justify-center bg-slate-950/60 rounded-xl border border-slate-800"
                  style={{ maxHeight: '72vh' }}
                >
                  <div style={{ width: `${zoomLevel}%` }}>
                    <img
                      src={
                        (isHoldingPeek || (!isBlinking && activeBlinkDoc === 'A') || (isBlinking && activeBlinkDoc === 'A'))
                          ? activePageRender.img_a || activePageRender.img_b!
                          : activePageRender.img_b || activePageRender.img_a!
                      }
                      alt="Blink View"
                      className="rounded-lg shadow-2xl border border-slate-800 w-full block transition-opacity duration-75"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Mode 4: Text / Clause Diff View ── */}
            {viewMode === 'text' && activePageSummary && (
              <div className="w-full max-w-4xl space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
                  <span className="font-bold text-slate-200">
                    Clause Discrepancies on Page {currentPage}
                  </span>
                  <span>{activeChanges.length} change item(s)</span>
                </div>

                {activeChanges.length === 0 ? (
                  <div className="p-12 text-center text-emerald-400 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-80" />
                    <p className="font-semibold text-sm">No textual discrepancies on this page.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-2">
                    {activeChanges.map((change) => (
                      <div
                        key={change.id}
                        className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs space-y-2 shadow-sm"
                      >
                        {change.type === 'delete' && (
                          <div className="text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20 line-through">
                            <span className="font-bold mr-2 text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded">
                              DELETED
                            </span>
                            {change.old_text}
                          </div>
                        )}
                        {change.type === 'insert' && (
                          <div className="text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                            <span className="font-bold mr-2 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                              ADDED
                            </span>
                            {change.new_text}
                          </div>
                        )}
                        {change.type === 'replace' && (
                          <div className="space-y-2">
                            <div className="text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20 line-through">
                              <span className="font-bold mr-2 text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded">
                                WAS (DOC A)
                              </span>
                              {change.old_text}
                            </div>
                            <div className="text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                              <span className="font-bold mr-2 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                                NOW (DOC B)
                              </span>
                              {change.new_text}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Interactive Changes Inspector Drawer (Collapsible) */}
        {showChangesDrawer && (
          <div className="lg:col-span-4 xl:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-brand-400" />
                Changes on Page {currentPage} ({activeChanges.length})
              </span>
              <button
                onClick={() => setShowChangesDrawer(false)}
                className="text-slate-500 hover:text-slate-300 p-1"
                title="Collapse Drawer"
              >
                <PanelRightClose className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeChanges.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                <CheckCircle2 className="w-8 h-8 text-emerald-500/50 mx-auto mb-2" />
                No differences detected on Page {currentPage}.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[68vh] overflow-y-auto pr-1">
                {activeChanges.map((change, idx) => {
                  const isSelected = selectedChangeId === change.id;
                  return (
                    <div
                      key={change.id}
                      onClick={() => handleSelectChange(change)}
                      className={`p-3 rounded-xl border cursor-pointer transition text-xs space-y-1.5 ${
                        isSelected
                          ? 'bg-brand-500/15 border-brand-500/60 ring-2 ring-brand-500/30'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-slate-400 font-bold">
                          #{idx + 1} &bull; P.{change.page_number}
                        </span>
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            change.type === 'replace'
                              ? 'bg-amber-500/20 text-amber-300'
                              : change.type === 'delete'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {change.type}
                        </span>
                      </div>

                      {change.old_text && (
                        <div className="text-rose-400/90 line-through truncate text-[11px] font-mono">
                          - {change.old_text}
                        </div>
                      )}
                      {change.new_text && (
                        <div className="text-emerald-400 font-medium truncate text-[11px] font-mono">
                          + {change.new_text}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Page Navigation Thumbnail Strip */}
      {analysisResult && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Document Overview ({analysisResult.max_pages} pages)</span>
            <span className="text-[11px] text-slate-500">Click any page card to inspect its changes</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-thin">
            {analysisResult.pages.map((p) => {
              const isSelected = p.page_number === currentPage;
              return (
                <button
                  key={`page_card_${p.page_number}`}
                  onClick={() => {
                    setCurrentPage(p.page_number);
                    setSelectedChangeId(null);
                  }}
                  className={`flex flex-col items-center justify-between w-20 h-20 p-2 rounded-xl border text-center transition shrink-0 ${
                    isSelected
                      ? 'border-brand-500 bg-brand-500/10 ring-2 ring-brand-500/30 shadow-lg'
                      : 'border-slate-800 bg-slate-950/60 hover:bg-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span className="text-[11px] font-mono text-slate-400 font-bold">P. {p.page_number}</span>

                  <div className="my-auto">
                    {p.status === 'identical' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
                    )}
                    {p.status === 'modified' && (
                      <AlertTriangle className="w-4 h-4 text-amber-400 mx-auto" />
                    )}
                    {p.status === 'added' && (
                      <PlusCircle className="w-4 h-4 text-sky-400 mx-auto" />
                    )}
                    {p.status === 'deleted' && (
                      <MinusCircle className="w-4 h-4 text-rose-400 mx-auto" />
                    )}
                  </div>

                  <span
                    className={`text-[9px] font-bold uppercase truncate px-1 rounded ${
                      p.status === 'identical'
                        ? 'text-emerald-400'
                        : p.status === 'modified'
                        ? 'text-amber-400'
                        : p.status === 'added'
                        ? 'text-sky-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {p.status}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
