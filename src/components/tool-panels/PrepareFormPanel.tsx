import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useAppStore } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import {
  FormBuilderField,
  BuilderFieldType,
  FormBuilderSaveResult,
} from '../../types';
import { formatSize } from '../../utils/formatters';
import {
  FormInput,
  Type,
  AlignLeft,
  CheckSquare,
  ListFilter,
  PenTool,
  RotateCcw,
  Sparkles,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Sliders,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Move,
  Settings,
  HelpCircle,
  FileCheck,
} from 'lucide-react';

const FIELD_DEFAULTS: Record<BuilderFieldType, { width: number; height: number; title: string }> = {
  text: { width: 180, height: 26, title: 'Text Field' },
  multiline: { width: 220, height: 60, title: 'Multi-line Paragraph' },
  checkbox: { width: 20, height: 20, title: 'Checkbox' },
  choice: { width: 180, height: 26, title: 'Dropdown Menu' },
  signature: { width: 180, height: 45, title: 'Signature Block' },
  button: { width: 120, height: 30, title: 'Reset Button' },
};

export const PrepareFormPanel: React.FC = () => {
  const { selectedFile } = useAppStore();
  const { callApi, triggerDownload } = useSidecar();

  // Mode: 'edit' (design layout) vs 'preview' (test filling fields)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  // Multi-page navigation
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pagePtSize, setPagePtSize] = useState<{ width: number; height: number }>({ width: 595, height: 842 });
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 600, height: 848 });
  const [renderingPage, setRenderingPage] = useState(false);

  // Field elements collection
  const [fields, setFields] = useState<FormBuilderField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  // Auto-detect scanning state
  const [detecting, setDetecting] = useState(false);
  const [detectMessage, setDetectMessage] = useState<string | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<FormBuilderSaveResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Preview mock values
  const [previewValues, setPreviewValues] = useState<Record<string, any>>({});

  // Canvas element ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Dragging and resizing state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizeCorner, setResizeCorner] = useState<string | null>(null);
  const [initialResizeState, setInitialResizeState] = useState<{ x: number; y: number; w: number; h: number; mx: number; my: number } | null>(null);

  // Track file identity to reset form studio state when document is cleared or switched
  const activeFileIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = selectedFile ? (selectedFile.id || selectedFile.path || selectedFile.name) : null;
    if (activeFileIdRef.current !== currentId) {
      activeFileIdRef.current = currentId;
      setFields([]);
      setSelectedFieldId(null);
      setSaveResult(null);
      setDetectMessage(null);
      setErrorMessage(null);
      setPreviewValues({});
      setCurrentPage(1);
    }
  }, [selectedFile]);

  // 1. Render PDF Page on Canvas via PDF.js
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

        // Responsive width target (max 680px for high-clarity viewing)
        const targetWidth = Math.min(680, window.innerWidth - 80);
        const scale = targetWidth / originalViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || isCancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setCanvasDimensions({ width: viewport.width, height: viewport.height });

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;
      } catch (err) {
        console.warn('PDF Page render error in PrepareForm:', err);
      } finally {
        if (!isCancelled) setRenderingPage(false);
      }
    };

    renderPage();
    return () => {
      isCancelled = true;
    };
  }, [selectedFile, currentPage]);

  const scale = canvasDimensions.width / (pagePtSize.width || 1);

  // 2. Add New Form Field
  const handleAddField = (type: BuilderFieldType) => {
    const defaults = FIELD_DEFAULTS[type];
    const newId = `field_${Date.now()}`;
    const count = fields.filter((f) => f.type === type).length + 1;
    const baseName = `${type}_${count}`;

    // Place in center of current visible canvas
    const x = Math.max(20, Math.round(canvasDimensions.width / 2 - defaults.width / 2));
    const y = Math.max(30, Math.round(canvasDimensions.height / 3));

    const newField: FormBuilderField = {
      id: newId,
      name: baseName,
      type,
      page_number: currentPage,
      x,
      y,
      width: defaults.width,
      height: defaults.height,
      required: false,
      readonly: false,
      tooltip: `Enter ${baseName}`,
      font_size: 10,
      options: type === 'choice' ? ['Option 1', 'Option 2', 'Option 3'] : undefined,
      value: type === 'choice' ? 'Option 1' : type === 'checkbox' ? false : '',
    };

    setFields((prev) => [...prev, newField]);
    setSelectedFieldId(newId);
    setSaveResult(null);
  };

  // 3. Remove Field
  const handleRemoveField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (selectedFieldId === id) setSelectedFieldId(null);
  };

  // Clear all form fields
  const handleClearAllFields = () => {
    setFields([]);
    setSelectedFieldId(null);
    setSaveResult(null);
    setDetectMessage(null);
    setErrorMessage(null);
    setPreviewValues({});
  };

  // 4. Update Field Property
  const handleUpdateField = (id: string, updates: Partial<FormBuilderField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  // 5. Drag Field Movement
  const handleMouseDown = (e: React.MouseEvent, fieldId: string) => {
    if (mode === 'preview') return;
    e.stopPropagation();
    setSelectedFieldId(fieldId);
    setDraggingId(fieldId);

    const f = fields.find((item) => item.id === fieldId);
    if (!f) return;
    setDragOffset({
      x: e.clientX - f.x,
      y: e.clientY - f.y,
    });
  };

  // 6. Resize Handle Mouse Down
  const handleResizeStart = (e: React.MouseEvent, fieldId: string, corner: string) => {
    if (mode === 'preview') return;
    e.stopPropagation();
    setSelectedFieldId(fieldId);
    setResizingId(fieldId);
    setResizeCorner(corner);

    const f = fields.find((item) => item.id === fieldId);
    if (!f) return;
    setInitialResizeState({
      x: f.x,
      y: f.y,
      w: f.width,
      h: f.height,
      mx: e.clientX,
      my: e.clientY,
    });
  };

  // Global Mouse Move & Up for drag/resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingId) {
        const nextX = Math.max(0, Math.min(canvasDimensions.width - 20, e.clientX - dragOffset.x));
        const nextY = Math.max(0, Math.min(canvasDimensions.height - 20, e.clientY - dragOffset.y));
        setFields((prev) =>
          prev.map((f) => (f.id === draggingId ? { ...f, x: Math.round(nextX), y: Math.round(nextY) } : f))
        );
      } else if (resizingId && initialResizeState && resizeCorner) {
        const dx = e.clientX - initialResizeState.mx;
        const dy = e.clientY - initialResizeState.my;

        let newW = initialResizeState.w;
        let newH = initialResizeState.h;

        if (resizeCorner.includes('e')) newW = Math.max(20, initialResizeState.w + dx);
        if (resizeCorner.includes('s')) newH = Math.max(16, initialResizeState.h + dy);

        setFields((prev) =>
          prev.map((f) => (f.id === resizingId ? { ...f, width: Math.round(newW), height: Math.round(newH) } : f))
        );
      }
    };

    const handleMouseUp = () => {
      setDraggingId(null);
      setResizingId(null);
      setResizeCorner(null);
      setInitialResizeState(null);
    };

    if (draggingId || resizingId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingId, resizingId, dragOffset, initialResizeState, resizeCorner, canvasDimensions]);

  // 7. Auto-Detect Fields
  const handleAutoDetect = async () => {
    if (!selectedFile) return;
    setDetecting(true);
    setDetectMessage(null);
    setErrorMessage(null);

    try {
      const res = await callApi('/api/forms/builder/detect', { file_path: selectedFile.path });
      if (res && res.status === 'success' && res.fields) {
        const detectedCount = res.total_detected;
        if (detectedCount === 0) {
          setDetectMessage('No obvious blank lines or boxes detected on this document.');
          return;
        }

        // Convert detected PDF point rects to canvas coordinates
        const importedFields: FormBuilderField[] = res.fields.map((df: any, idx: number) => {
          const [x1, y1, x2, y2] = df.rect;
          const canvasX = Math.round(x1 * scale);
          const canvasY = Math.round((pagePtSize.height - y2) * scale);
          const canvasW = Math.max(20, Math.round((x2 - x1) * scale));
          const canvasH = Math.max(16, Math.round((y2 - y1) * scale));

          return {
            id: `auto_${Date.now()}_${idx}`,
            name: df.name,
            type: df.type as BuilderFieldType,
            page_number: df.page_number,
            x: canvasX,
            y: canvasY,
            width: canvasW,
            height: canvasH,
            required: df.required || false,
            tooltip: df.tooltip || df.name,
            font_size: 10,
          };
        });

        // Replace previous auto-detected fields and deduplicate with any manual fields
        setFields((prev) => {
          // If previous fields exist, keep only manual additions that don't overlap with newly detected fields
          const manualFields = prev.filter((f) => !f.id.startsWith('auto_'));
          const retainedManual = manualFields.filter((mf) => {
            return !importedFields.some((inf) => {
              if (mf.page_number !== inf.page_number) return false;
              const overlapX = Math.abs(mf.x - inf.x) < 25;
              const overlapY = Math.abs(mf.y - inf.y) < 15;
              return overlapX && overlapY;
            });
          });
          return [...retainedManual, ...importedFields];
        });
        setSelectedFieldId(importedFields[0]?.id || null);
        setDetectMessage(
          `Successfully detected and placed ${detectedCount} interactive field${detectedCount > 1 ? 's' : ''}!`
        );
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Error auto-detecting form fields.');
    } finally {
      setDetecting(false);
    }
  };

  // 8. Save Interactive Form PDF
  const handleSaveForm = async () => {
    if (!selectedFile) return;
    if (fields.length === 0) {
      setErrorMessage('Please place at least one form field before saving.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSaveResult(null);

    // Convert all fields to PDF points
    const payloadFields = fields.map((f) => {
      const pdfX1 = f.x / scale;
      const pdfX2 = (f.x + f.width) / scale;
      const pdfY1 = pagePtSize.height - (f.y + f.height) / scale;
      const pdfY2 = pagePtSize.height - f.y / scale;

      return {
        name: f.name.trim() || `field_${f.id}`,
        type: f.type,
        page_number: f.page_number,
        rect: [round(pdfX1), round(pdfY1), round(pdfX2), round(pdfY2)],
        value: f.value,
        options: f.options,
        required: f.required,
        readonly: f.readonly,
        tooltip: f.tooltip,
        font_size: f.font_size || 10,
      };
    });

    try {
      const res = await callApi('/api/forms/builder/save', {
        file_path: selectedFile.path,
        fields: payloadFields,
        output_filename: `fillable_${selectedFile.name}`,
      });

      if (res && res.status === 'success') {
        setSaveResult(res as FormBuilderSaveResult);
      } else {
        setErrorMessage(res?.detail || 'Failed to save interactive form.');
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Error saving interactive form.');
    } finally {
      setSaving(false);
    }
  };

  const selectedField = fields.find((f) => f.id === selectedFieldId);
  const pageFields = fields.filter((f) => f.page_number === currentPage);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* Top Header */}
      <div className="border-b border-slate-800 pb-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FormInput className="w-5 h-5 text-brand-400" />
              Prepare a Form &bull; Interactive Form Authoring Studio
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Add fillable text fields, checkboxes, dropdowns, and signature blocks to any static or scanned PDF document.
            </p>
          </div>

          {/* Mode Switcher: Edit Design vs Interactive Test Fill */}
          <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800 self-start sm:self-auto shadow-inner">
            <button
              onClick={() => setMode('edit')}
              className={`py-2 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                mode === 'edit'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Design Studio
            </button>
            <button
              onClick={() => setMode('preview')}
              className={`py-2 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                mode === 'preview'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Test Fill Mode
            </button>
          </div>
        </div>

        {/* Form Elements Palette Toolbar */}
        {mode === 'edit' && (
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400 font-semibold mr-1">Add Element:</span>
              <button
                onClick={() => handleAddField('text')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 border border-slate-700 transition"
              >
                <Type className="w-3.5 h-3.5 text-brand-400" /> Text Field
              </button>
              <button
                onClick={() => handleAddField('multiline')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 border border-slate-700 transition"
              >
                <AlignLeft className="w-3.5 h-3.5 text-brand-400" /> Paragraph Box
              </button>
              <button
                onClick={() => handleAddField('checkbox')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 border border-slate-700 transition"
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> Checkbox
              </button>
              <button
                onClick={() => handleAddField('choice')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 border border-slate-700 transition"
              >
                <ListFilter className="w-3.5 h-3.5 text-blue-400" /> Dropdown Menu
              </button>
              <button
                onClick={() => handleAddField('signature')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 border border-slate-700 transition"
              >
                <PenTool className="w-3.5 h-3.5 text-indigo-400" /> Signature Block
              </button>
              <button
                onClick={() => handleAddField('button')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 border border-slate-700 transition"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Reset Button
              </button>

              {fields.length > 0 && (
                <button
                  onClick={handleClearAllFields}
                  className="px-2.5 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 flex items-center gap-1.5 border border-red-800/60 transition"
                  title="Remove all fields from canvas"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" /> Clear All ({fields.length})
                </button>
              )}
            </div>

            {/* Smart Auto-Detect Button */}
            <button
              onClick={handleAutoDetect}
              disabled={detecting || !selectedFile}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
            >
              {detecting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Scanning Layout...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Auto-Detect Fields
                </>
              )}
            </button>
          </div>
        )}

        {detectMessage && (
          <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/60 text-indigo-300 text-xs flex items-center gap-2">
            <Sparkles className="w-4 h-4 flex-shrink-0 text-indigo-400" />
            <span>{detectMessage}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Center / Left Column: PDF Canvas Viewport with Overlaid Interactive Widgets */}
        <div className="lg:col-span-8 space-y-4">
          {/* Page Navigation & Zoom Header */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || renderingPage}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-slate-300 font-mono">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || renderingPage}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3 text-slate-400">
              <span>{pageFields.length} field{pageFields.length === 1 ? '' : 's'} on page</span>
              {mode === 'edit' && (
                <span className="text-[11px] text-brand-400 font-medium">Click field to inspect &bull; Drag to move</span>
              )}
            </div>
          </div>

          {/* Canvas Viewport Container */}
          <div
            ref={containerRef}
            className="relative bg-slate-950 rounded-2xl border border-slate-800 p-4 overflow-auto flex justify-center shadow-inner min-h-[500px]"
          >
            {renderingPage && (
              <div className="absolute inset-0 bg-slate-950/70 z-20 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-brand-400" />
              </div>
            )}

            <div className="relative inline-block select-none shadow-2xl rounded border border-slate-800/80 bg-white">
              <canvas ref={canvasRef} className="block" />

              {/* OVERLAID INTERACTIVE FORM FIELDS */}
              {pageFields.map((f) => {
                const isSelected = selectedFieldId === f.id && mode === 'edit';

                return (
                  <div
                    key={f.id}
                    onMouseDown={(e) => handleMouseDown(e, f.id)}
                    style={{
                      position: 'absolute',
                      left: `${f.x}px`,
                      top: `${f.y}px`,
                      width: `${f.width}px`,
                      height: `${f.height}px`,
                    }}
                    className={`group transition-all ${
                      mode === 'edit' ? 'cursor-move' : 'cursor-default'
                    } ${
                      isSelected
                        ? 'ring-2 ring-brand-500 shadow-lg z-30'
                        : 'hover:ring-1 hover:ring-brand-400/60 z-10'
                    }`}
                  >
                    {/* Visual Appearance in Edit Mode */}
                    {mode === 'edit' ? (
                      <div className="w-full h-full bg-brand-500/10 border-2 border-brand-500/60 rounded px-1 flex items-center justify-between overflow-hidden">
                        <div className="flex items-center gap-1 truncate text-[11px] font-mono font-bold text-slate-900 bg-white/90 px-1 py-0.5 rounded shadow-sm">
                          {f.type === 'text' && <Type className="w-3 h-3 text-brand-600" />}
                          {f.type === 'multiline' && <AlignLeft className="w-3 h-3 text-brand-600" />}
                          {f.type === 'checkbox' && <CheckSquare className="w-3 h-3 text-emerald-600" />}
                          {f.type === 'choice' && <ListFilter className="w-3 h-3 text-blue-600" />}
                          {f.type === 'signature' && <PenTool className="w-3 h-3 text-indigo-600" />}
                          {f.type === 'button' && <RotateCcw className="w-3 h-3 text-amber-600" />}
                          <span className="truncate max-w-[120px]">{f.name}</span>
                          {f.required && <span className="text-red-500 font-bold">*</span>}
                        </div>

                        {/* Quick Delete Pill */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveField(f.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 hover:text-red-600 text-slate-500 p-0.5 bg-white rounded transition"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>

                        {/* Resize Corner Handle */}
                        {isSelected && (
                          <div
                            onMouseDown={(e) => handleResizeStart(e, f.id, 'se')}
                            className="absolute -right-1 -bottom-1 w-3 h-3 bg-brand-600 border border-white cursor-se-resize rounded-full shadow"
                          />
                        )}
                      </div>
                    ) : (
                      /* Interactive Preview / Test Fill Mode */
                      <div className="w-full h-full">
                        {f.type === 'text' && (
                          <input
                            type="text"
                            value={previewValues[f.id] ?? f.value ?? ''}
                            onChange={(e) => setPreviewValues({ ...previewValues, [f.id]: e.target.value })}
                            placeholder={f.tooltip}
                            className="w-full h-full bg-blue-50/70 border border-blue-400 rounded px-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        )}

                        {f.type === 'multiline' && (
                          <textarea
                            value={previewValues[f.id] ?? f.value ?? ''}
                            onChange={(e) => setPreviewValues({ ...previewValues, [f.id]: e.target.value })}
                            placeholder={f.tooltip}
                            className="w-full h-full bg-blue-50/70 border border-blue-400 rounded p-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none resize-none"
                          />
                        )}

                        {f.type === 'checkbox' && (
                          <input
                            type="checkbox"
                            checked={Boolean(previewValues[f.id] ?? f.value)}
                            onChange={(e) => setPreviewValues({ ...previewValues, [f.id]: e.target.checked })}
                            className="w-full h-full accent-emerald-600 cursor-pointer"
                          />
                        )}

                        {f.type === 'choice' && (
                          <select
                            value={previewValues[f.id] ?? f.value ?? ''}
                            onChange={(e) => setPreviewValues({ ...previewValues, [f.id]: e.target.value })}
                            className="w-full h-full bg-blue-50/70 border border-blue-400 rounded px-1.5 text-xs text-slate-900"
                          >
                            {(f.options || ['Option 1', 'Option 2']).map((opt, oIdx) => (
                              <option key={oIdx} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}

                        {f.type === 'signature' && (
                          <div className="w-full h-full border-2 border-dashed border-indigo-400 bg-indigo-50/50 rounded flex items-center justify-center text-[10px] text-indigo-700 font-semibold gap-1">
                            <PenTool className="w-3 h-3" />
                            <span>Digital Signature Block</span>
                          </div>
                        )}

                        {f.type === 'button' && (
                          <button
                            type="button"
                            onClick={() => setPreviewValues({})}
                            className="w-full h-full bg-slate-200 hover:bg-slate-300 border border-slate-400 rounded text-xs font-semibold text-slate-800"
                          >
                            {f.tooltip || 'Reset Form'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Properties Inspector & Saving */}
        <div className="lg:col-span-4 space-y-4">
          {selectedField ? (
            /* FIELD PROPERTIES INSPECTOR */
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-brand-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Field Properties
                  </h3>
                </div>
                <button
                  onClick={() => handleRemoveField(selectedField.id)}
                  className="text-slate-500 hover:text-red-400 transition"
                  title="Delete field"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Field Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-300">Field Name (Technical ID)</label>
                <input
                  type="text"
                  value={selectedField.name}
                  onChange={(e) => handleUpdateField(selectedField.id, { name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-brand-500 outline-none"
                />
              </div>

              {/* Tooltip / Label */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-300">Recipient Tooltip / Placeholder</label>
                <input
                  type="text"
                  value={selectedField.tooltip || ''}
                  onChange={(e) => handleUpdateField(selectedField.id, { tooltip: e.target.value })}
                  placeholder="e.g. Please enter your legal name..."
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:border-brand-500 outline-none"
                />
              </div>

              {/* Field Type Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-300">Widget Type</label>
                <select
                  value={selectedField.type}
                  onChange={(e) => handleUpdateField(selectedField.id, { type: e.target.value as BuilderFieldType })}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
                >
                  <option value="text">Single-line Text Field</option>
                  <option value="multiline">Multi-line Paragraph</option>
                  <option value="checkbox">Checkbox</option>
                  <option value="choice">Dropdown Menu</option>
                  <option value="signature">Digital Signature Block</option>
                  <option value="button">Reset Action Button</option>
                </select>
              </div>

              {/* Dropdown Options Editor (if choice type) */}
              {selectedField.type === 'choice' && (
                <div className="space-y-2 pt-1 border-t border-slate-800/80">
                  <label className="text-[10px] font-semibold text-slate-300">Dropdown Options (one per line)</label>
                  <textarea
                    value={(selectedField.options || []).join('\n')}
                    onChange={(e) =>
                      handleUpdateField(selectedField.id, {
                        options: e.target.value.split('\n').filter((s) => s.trim().length > 0),
                      })
                    }
                    rows={4}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white font-mono outline-none"
                  />
                </div>
              )}

              {/* Validation & Flag Toggles */}
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedField.required)}
                    onChange={(e) => handleUpdateField(selectedField.id, { required: e.target.checked })}
                    className="accent-brand-500 rounded"
                  />
                  <span className="text-[11px] text-slate-300">Required Field (mandatory before submit)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedField.readonly)}
                    onChange={(e) => handleUpdateField(selectedField.id, { readonly: e.target.checked })}
                    className="accent-brand-500 rounded"
                  />
                  <span className="text-[11px] text-slate-300">Read-Only (non-editable by recipient)</span>
                </label>
              </div>

              {/* Position and Size telemetry */}
              <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[10px] text-slate-400 font-mono">
                <div>Width: {selectedField.width}px</div>
                <div>Height: {selectedField.height}px</div>
                <div>X: {selectedField.x}px</div>
                <div>Y: {selectedField.y}px</div>
              </div>
            </div>
          ) : (
            /* Overview of all fields */
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5 text-brand-400" />
                  Form Structure ({fields.length} Fields)
                </h3>
                {fields.length > 0 && (
                  <button
                    onClick={handleClearAllFields}
                    className="text-[10px] text-red-400 hover:text-red-300 font-medium transition"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {fields.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl space-y-2">
                  <FormInput className="w-8 h-8 mx-auto opacity-30 text-slate-400" />
                  <p>No fields placed yet.</p>
                  <p className="text-[11px] text-slate-600">
                    Click an element in the top palette or use Auto-Detect to begin.
                  </p>
                </div>
              ) : (
                <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
                  {fields.map((f, i) => (
                    <div
                      key={f.id}
                      onClick={() => {
                        setCurrentPage(f.page_number);
                        setSelectedFieldId(f.id);
                      }}
                      className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800/80 cursor-pointer flex items-center justify-between text-xs transition"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className="text-[10px] font-mono text-slate-500">{i + 1}.</span>
                        <span className="font-medium text-slate-200 truncate">{f.name}</span>
                        <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                          {f.type}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">P.{f.page_number}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Save & Export Button */}
          <button
            onClick={handleSaveForm}
            disabled={saving || fields.length === 0 || !selectedFile}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 transition active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Compiling AcroForm Structure...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Save &amp; Export Fillable PDF ({fields.length} Field{fields.length === 1 ? '' : 's'})
              </>
            )}
          </button>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Download Card */}
          {saveResult && (
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  Interactive Form Created!
                </div>
                <span className="text-[10px] font-mono text-emerald-400/80">
                  {saveResult.total_fields} AcroForm fields
                </span>
              </div>

              <p className="text-xs text-emerald-200/90 leading-relaxed">
                Your fillable PDF is ready. Recipients in Adobe Reader, Chrome, or any viewer can now click, type, and submit.
              </p>

              <button
                onClick={() => triggerDownload(saveResult.download_url)}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-[0.99]"
              >
                <Download className="w-3.5 h-3.5" />
                Download Fillable PDF ({formatSize(saveResult.file_size)})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Numeric rounding helper
function round(num: number): number {
  return Math.round(num * 10) / 10;
}
