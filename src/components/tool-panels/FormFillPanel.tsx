import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useAppStore } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import {
  FileEdit,
  CheckCircle,
  AlertCircle,
  Download,
  ChevronLeft,
  ChevronRight,
  Type,
  CheckSquare,
  ListFilter,
  Plus,
  Trash2,
  RefreshCw,
  Sparkles,
  Sliders,
  Move,
  Layers,
} from 'lucide-react';

interface FormFieldItem {
  name: string;
  type: 'text' | 'checkbox' | 'choice' | 'signature';
  value: string;
  options: string[];
}

interface TextAnnotation {
  id: string;
  pageNumber: number;
  text: string;
  fontSize: number;
  hexColor: string;
  // Canvas pixel coordinates
  canvasX: number;
  canvasY: number;
  // Converted PDF points
  pdfX: number;
  pdfY: number;
}

export const FormFillPanel: React.FC = () => {
  const { selectedFile, currentJob } = useAppStore();
  const { callApi, triggerDownload } = useSidecar();

  // Mode: 'acroform' (interactive fields) vs 'annotations' (click-to-type on flat PDF)
  const [activeTab, setActiveTab] = useState<'acroform' | 'annotations'>('acroform');

  // AcroForm fields from backend
  const [loadingFields, setLoadingFields] = useState(false);
  const [hasAcroform, setHasAcroform] = useState(false);
  const [formFields, setFormFields] = useState<FormFieldItem[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [flatten, setFlatten] = useState(true);
  const [lockPermissions, setLockPermissions] = useState(true);

  // Flat text annotations
  const [annotations, setAnnotations] = useState<TextAnnotation[]>([]);
  const [selectedAnnotId, setSelectedAnnotId] = useState<string | null>(null);
  const [annotColor, setAnnotColor] = useState('#0f172a');
  const [annotFontSize, setAnnotFontSize] = useState(12);

  // PDF Page Viewer
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [renderingPage, setRenderingPage] = useState(false);
  const [pagePtSize, setPagePtSize] = useState<{ width: number; height: number }>({ width: 595, height: 842 });
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 500, height: 700 });

  // Dragging annotation state
  const [draggingAnnotId, setDraggingAnnotId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // 1. Fetch AcroForm fields whenever a file is selected
  useEffect(() => {
    if (!selectedFile || !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setFormFields([]);
      setHasAcroform(false);
      setFieldValues({});
      return;
    }

    let isCancelled = false;
    setLoadingFields(true);

    const fetchFields = async () => {
      try {
        const res = await callApi('/api/forms/fields', { file_path: selectedFile.path });
        if (isCancelled) return;

        if (res && res.status === 'success') {
          setHasAcroform(res.has_acroform);
          setFormFields(res.fields || []);

          // Initialize values map
          const initialValues: Record<string, any> = {};
          (res.fields || []).forEach((f: FormFieldItem) => {
            if (f.type === 'checkbox') {
              const valStr = String(f.value || '').trim().toLowerCase();
              initialValues[f.name] = valStr === 'true' || valStr === 'yes' || valStr === '1' || valStr === 'on';
            } else {
              initialValues[f.name] = f.value || '';
            }
          });
          setFieldValues(initialValues);

          if (!res.has_acroform) {
            setActiveTab('annotations');
          } else {
            setActiveTab('acroform');
          }
        }
      } catch (err) {
        console.warn('Failed to load PDF form fields:', err);
      } finally {
        if (!isCancelled) setLoadingFields(false);
      }
    };

    fetchFields();

    return () => {
      isCancelled = true;
    };
  }, [selectedFile]);

  // 2. Render PDF Page on Canvas via PDF.js
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

        // Responsive width
        const targetWidth = Math.min(520, window.innerWidth - 64);
        const scale = targetWidth / originalViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = previewCanvasRef.current;
        if (!canvas || isCancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setCanvasDimensions({ width: viewport.width, height: viewport.height });

        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;

        if (!isCancelled) setRenderingPage(false);
      } catch (err) {
        console.warn('Failed to render PDF page preview:', err);
        if (!isCancelled) setRenderingPage(false);
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [selectedFile, currentPage]);

  // Coordinate scaling helpers
  const scaleX = canvasDimensions.width > 0 ? pagePtSize.width / canvasDimensions.width : 1;
  const scaleY = canvasDimensions.height > 0 ? pagePtSize.height / canvasDimensions.height : 1;

  // 3. Click-to-add text annotation on flat document
  const handleCanvasContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If clicked on an existing annotation input, don't create a new one
    if ((e.target as HTMLElement).closest('.annot-box')) {
      return;
    }

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert to PDF coordinates (bottom-left origin)
    const pdfX = Math.round(clickX * scaleX * 10) / 10;
    const pdfY = Math.round((canvasDimensions.height - clickY) * scaleY * 10) / 10;

    const newAnnot: TextAnnotation = {
      id: `annot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      pageNumber: currentPage,
      text: 'Type text here...',
      fontSize: annotFontSize,
      hexColor: annotColor,
      canvasX: Math.round(clickX),
      canvasY: Math.round(clickY),
      pdfX,
      pdfY,
    };

    setAnnotations((prev) => [...prev, newAnnot]);
    setSelectedAnnotId(newAnnot.id);
  };

  const handleAnnotMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedAnnotId(id);
    setDraggingAnnotId(id);

    const annot = annotations.find((a) => a.id === id);
    if (annot) {
      setDragOffset({
        x: e.clientX - annot.canvasX,
        y: e.clientY - annot.canvasY,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingAnnotId) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newX = Math.max(0, Math.min(mouseX - (dragOffset.x - rect.left), canvasDimensions.width - 60));
    const newY = Math.max(0, Math.min(mouseY - (dragOffset.y - rect.top), canvasDimensions.height - 25));

    const pdfX = Math.round(newX * scaleX * 10) / 10;
    const pdfY = Math.round((canvasDimensions.height - newY) * scaleY * 10) / 10;

    setAnnotations((prev) =>
      prev.map((a) =>
        a.id === draggingAnnotId
          ? { ...a, canvasX: Math.round(newX), canvasY: Math.round(newY), pdfX, pdfY }
          : a
      )
    );
  };

  const handleMouseUp = () => {
    if (draggingAnnotId) {
      setDraggingAnnotId(null);
    }
  };

  const updateAnnotationText = (id: string, text: string) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, text } : a))
    );
  };

  const deleteAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    if (selectedAnnotId === id) setSelectedAnnotId(null);
  };

  // 4. Submit Fill & Save
  const handleSaveForm = async () => {
    if (!selectedFile) {
      alert('Please upload and select a PDF document first.');
      return;
    }

    const payloadAnnotations = annotations.map((a) => ({
      page_number: a.pageNumber,
      x: a.pdfX,
      y: a.pdfY,
      text: a.text,
      font_size: a.fontSize,
      hex_color: a.hexColor,
    }));

    await callApi('/api/forms/fill', {
      file_path: selectedFile.path,
      field_values: hasAcroform ? fieldValues : undefined,
      text_annotations: payloadAnnotations.length > 0 ? payloadAnnotations : undefined,
      flatten,
      lock_permissions: lockPermissions,
      output_filename: `filled_${selectedFile.name}`,
    });
  };

  const currentAnnotations = annotations.filter((a) => a.pageNumber === currentPage);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <FileEdit className="w-5 h-5 text-brand-400" />
          Fill PDF Forms & Documents
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Detect and fill interactive AcroForm fields (text fields, checkboxes, dropdowns) or click anywhere to type on flat, scanned PDF forms.
        </p>
      </div>

      {/* Mode Tabs */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setActiveTab('acroform')}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'acroform'
              ? 'border-brand-500 bg-brand-500/10 text-white shadow-sm'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Type className="w-4 h-4 text-brand-400" />
          Interactive Form Fields {hasAcroform && `(${formFields.length})`}
        </button>

        <button
          onClick={() => setActiveTab('annotations')}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'annotations'
              ? 'border-brand-500 bg-brand-500/10 text-white shadow-sm'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Plus className="w-4 h-4 text-brand-400" />
          Click-to-Type Text on Any Page {annotations.length > 0 && `(${annotations.length})`}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Controls / Fields */}
        <div className="lg:col-span-5 space-y-4">
          {/* TAB A: INTERACTIVE ACROFORM FIELDS */}
          {activeTab === 'acroform' && (
            <div className="space-y-4">
              {loadingFields ? (
                <div className="p-8 text-center bg-slate-950/40 border border-slate-800 rounded-xl space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-brand-400" />
                  <p className="text-xs text-slate-400">Scanning document for form fields...</p>
                </div>
              ) : hasAcroform && formFields.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4" /> {formFields.length} Interactive Fields Found
                    </span>
                    <button
                      onClick={() => {
                        const resetVals: Record<string, any> = {};
                        formFields.forEach((f) => (resetVals[f.name] = f.type === 'checkbox' ? false : ''));
                        setFieldValues(resetVals);
                      }}
                      className="text-[11px] text-slate-400 hover:text-red-400"
                    >
                      Reset All
                    </button>
                  </div>

                  {/* Scrollable Form Fields List */}
                  <div className="max-h-[460px] overflow-y-auto space-y-2.5 pr-1 border border-slate-800/60 rounded-xl p-3 bg-slate-950/50">
                    {formFields.map((f) => (
                      <div key={f.name} className="space-y-1">
                        <label className="text-[11px] font-medium text-slate-300 flex items-center justify-between">
                          <span className="truncate max-w-[200px]" title={f.name}>
                            {f.name}
                          </span>
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {f.type}
                          </span>
                        </label>

                        {/* Text Field */}
                        {f.type === 'text' && (
                          <input
                            type="text"
                            value={fieldValues[f.name] ?? ''}
                            onChange={(e) =>
                              setFieldValues((prev) => ({ ...prev, [f.name]: e.target.value }))
                            }
                            placeholder={`Enter ${f.name}`}
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                          />
                        )}

                        {/* Checkbox */}
                        {f.type === 'checkbox' && (
                          <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700 cursor-pointer hover:bg-slate-800">
                            <input
                              type="checkbox"
                              checked={Boolean(fieldValues[f.name])}
                              onChange={(e) =>
                                setFieldValues((prev) => ({ ...prev, [f.name]: e.target.checked }))
                              }
                              className="w-4 h-4 rounded text-brand-600 accent-brand-500 cursor-pointer"
                            />
                            <span className="text-xs text-slate-300">
                              {Boolean(fieldValues[f.name]) ? 'Checked (Yes)' : 'Unchecked (No)'}
                            </span>
                          </label>
                        )}

                        {/* Choice / Dropdown */}
                        {f.type === 'choice' && (
                          <select
                            value={fieldValues[f.name] ?? ''}
                            onChange={(e) =>
                              setFieldValues((prev) => ({ ...prev, [f.name]: e.target.value }))
                            }
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                          >
                            <option value="">Select an option...</option>
                            {f.options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    No AcroForm Fields Detected
                  </div>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    This document appears to be a standard flat or scanned form. Use the <strong>"Click-to-Type Text on Any Page"</strong> tab above to type your details right onto the document lines!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB B: CLICK-TO-TYPE TEXT ANNOTATIONS (FLAT FORMS) */}
          {activeTab === 'annotations' && (
            <div className="space-y-3.5">
              <div className="p-3 bg-slate-800/40 border border-slate-800 rounded-xl space-y-1.5 text-xs text-slate-300">
                <span className="font-semibold text-brand-400 flex items-center gap-1">
                  <Type className="w-3.5 h-3.5" /> Type Anywhere on Document
                </span>
                <p className="text-[11px] text-slate-400">
                  Click anywhere on the preview to drop a text box. Drag it to fit the form line, then type your text.
                </p>
              </div>

              {/* Text Styling Bar */}
              <div className="p-3 bg-slate-800/30 border border-slate-800 rounded-xl space-y-2">
                <span className="text-[10px] text-slate-400 block">Text Style:</span>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {[
                      { color: '#0f172a', label: 'Black' },
                      { color: '#1e3a8a', label: 'Navy' },
                      { color: '#2563eb', label: 'Blue' },
                    ].map((c) => (
                      <button
                        key={c.color}
                        onClick={() => setAnnotColor(c.color)}
                        style={{ backgroundColor: c.color }}
                        className={`w-5 h-5 rounded-full border transition-all ${
                          annotColor === c.color ? 'ring-2 ring-brand-400 scale-110 border-white' : 'border-slate-600'
                        }`}
                        title={c.label}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <span className="text-[10px]">Font:</span>
                    {[10, 12, 14, 16].map((s) => (
                      <button
                        key={s}
                        onClick={() => setAnnotFontSize(s)}
                        className={`px-2 py-0.5 text-[10px] rounded border ${
                          annotFontSize === s
                            ? 'bg-brand-600/30 border-brand-500 text-brand-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                      >
                        {s}pt
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* List of Marked Text Annotations on Current Page */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="font-medium text-[11px]">
                    Text on Page {currentPage} ({currentAnnotations.length})
                  </span>
                  {annotations.length > 0 && (
                    <button
                      onClick={() => setAnnotations([])}
                      className="text-[11px] text-slate-400 hover:text-red-400"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {currentAnnotations.length === 0 ? (
                    <div className="p-3 text-center border border-dashed border-slate-800 rounded-lg text-[11px] text-slate-500">
                      Click anywhere on the preview to add text
                    </div>
                  ) : (
                    currentAnnotations.map((a) => (
                      <div
                        key={a.id}
                        className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                          selectedAnnotId === a.id
                            ? 'bg-brand-500/10 border-brand-500/40 text-white'
                            : 'bg-slate-800/40 border-slate-800 text-slate-300'
                        }`}
                      >
                        <input
                          type="text"
                          value={a.text}
                          onChange={(e) => updateAnnotationText(a.id, e.target.value)}
                          className="flex-1 bg-transparent border-0 focus:outline-none text-xs text-slate-200"
                        />
                        <button
                          onClick={() => deleteAnnotation(a.id)}
                          className="text-slate-500 hover:text-red-400 p-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Form Flattening & Permissions Options */}
          <div className="pt-2 space-y-2">
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-800/40 border border-slate-800 cursor-pointer hover:bg-slate-800/60 transition-colors">
              <input
                type="checkbox"
                checked={flatten}
                onChange={(e) => setFlatten(e.target.checked)}
                className="w-4 h-4 rounded text-brand-600 accent-brand-500 cursor-pointer mt-0.5"
              />
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  Flatten Form Fields & Text (Strip AcroForm)
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Bakes field values directly into static page content and strips all interactive form widgets, so Adobe Reader cannot alter them.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-800/40 border border-slate-800 cursor-pointer hover:bg-slate-800/60 transition-colors">
              <input
                type="checkbox"
                checked={lockPermissions}
                onChange={(e) => setLockPermissions(e.target.checked)}
                className="w-4 h-4 rounded text-brand-600 accent-brand-500 cursor-pointer mt-0.5"
              />
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  Lock Document Permissions (Read-Only Security)
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Restricts document editing even in Adobe Acrobat Pro or PDF editors without requiring a password to open.
                </span>
              </div>
            </label>
          </div>

          {/* Action Button */}
          <button
            onClick={handleSaveForm}
            disabled={!selectedFile || currentJob.status === 'running'}
            className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            {currentJob.status === 'running' ? 'Saving Filled PDF...' : 'Fill & Save PDF Form'}
          </button>
        </div>

        {/* Right Column: PDF Page Preview Canvas */}
        <div className="lg:col-span-7 flex flex-col items-center justify-start space-y-3">
          {/* Page Navigator */}
          <div className="w-full flex items-center justify-between bg-slate-800/60 border border-slate-800 px-3.5 py-2 rounded-xl text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Layers className="w-4 h-4 text-brand-400" />
              <span className="font-medium">
                {activeTab === 'annotations'
                  ? 'Click anywhere on the page to place a text entry'
                  : 'Document Page View'}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                disabled={currentPage <= 1 || renderingPage}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-slate-300 font-mono">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages || renderingPage}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Document Preview Container */}
          <div
            ref={containerRef}
            onClick={activeTab === 'annotations' ? handleCanvasContainerClick : undefined}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className={`relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl select-none ${
              activeTab === 'annotations' ? 'cursor-crosshair' : 'cursor-default'
            }`}
            style={{
              width: canvasDimensions.width > 0 ? `${canvasDimensions.width}px` : '100%',
              height: canvasDimensions.height > 0 ? `${canvasDimensions.height}px` : '640px',
            }}
          >
            <canvas ref={previewCanvasRef} className="block" />

            {renderingPage && (
              <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center text-xs text-slate-300 gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-brand-400" />
                Rendering Page {currentPage}...
              </div>
            )}

            {/* Render On-Page Text Annotations */}
            {currentAnnotations.map((ann) => (
              <div
                key={ann.id}
                onMouseDown={(e) => handleAnnotMouseDown(e, ann.id)}
                className={`annot-box absolute px-2 py-0.5 rounded cursor-move shadow-md transition-all flex items-center gap-1 group ${
                  selectedAnnotId === ann.id
                    ? 'border border-brand-400 bg-brand-500/20 ring-1 ring-brand-400'
                    : 'border border-slate-600/80 bg-slate-900/80 hover:border-brand-500/60'
                }`}
                style={{
                  left: `${ann.canvasX}px`,
                  top: `${ann.canvasY}px`,
                  color: ann.hexColor,
                  fontSize: `${ann.fontSize}px`,
                }}
              >
                <span className="font-sans leading-none">{ann.text || '...'}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteAnnotation(ann.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-slate-400 ml-1 transition-opacity"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Global Result feedback */}
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
            <Download className="w-3.5 h-3.5" /> Save Filled PDF
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
