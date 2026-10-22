import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useAppStore, showToast } from '../../store/useAppStore';
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
  Sliders,
  Move,
  Layers,
  FileSpreadsheet,
  Table,
  CheckCircle2,
  FileCheck,
  BarChart3,
  Files,
  Eye,
  EyeOff,
  Key,
} from 'lucide-react';
import { BatchFormExportResult } from '../../types';
import { formatSize } from '../../utils/formatters';

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
  const { selectedFile, currentJob, files, removeFile } = useAppStore();
  const { callApi, triggerDownload } = useSidecar();

  // Top-level Mode: 'single' (fill active PDF) vs 'batch' (export multiple forms to Excel/CSV)
  const [mainMode, setMainMode] = useState<'single' | 'batch'>('single');

  // Batch Form Export State
  const [batchOutputName, setBatchOutputName] = useState('batch_form_export');
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchFormExportResult | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchPreviewTab, setBatchPreviewTab] = useState<'data' | 'schema'>('data');

  // Mode: 'acroform' (interactive fields) vs 'annotations' (click-to-type on flat PDF)
  const [activeTab, setActiveTab] = useState<'acroform' | 'annotations'>('acroform');

  // AcroForm fields from backend
  const [loadingFields, setLoadingFields] = useState(false);
  const [hasAcroform, setHasAcroform] = useState(false);
  const [formFields, setFormFields] = useState<FormFieldItem[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [flatten, setFlatten] = useState(true);
  const [lockPermissions, setLockPermissions] = useState(false);
  const [permissionsPassword, setPermissionsPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
      showToast('Please upload and select a PDF document first.', 'warning');
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
      permissions_password: lockPermissions && permissionsPassword.trim() ? permissionsPassword.trim() : undefined,
      output_filename: `filled_${selectedFile.name}`,
    });
  };

  const handleBatchExport = async () => {
    const pdfPaths = files
      .filter((f) => f.name.toLowerCase().endsWith('.pdf'))
      .map((f) => f.path);

    if (pdfPaths.length === 0) {
      setBatchError('No PDF documents in queue. Please drop filled PDF forms in the dropzone above.');
      return;
    }

    setBatchProcessing(true);
    setBatchError(null);
    try {
      const res = await callApi('/api/forms/batch-export', {
        file_paths: pdfPaths,
        output_base_name: batchOutputName.trim() || 'batch_form_export',
      });
      if (res && res.status === 'success') {
        setBatchResult(res as BatchFormExportResult);
      } else {
        setBatchError(res?.detail || 'Batch form data extraction failed.');
      }
    } catch (err: any) {
      setBatchError(err?.message || 'Error executing batch form extraction.');
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleDownloadXlsx = () => {
    if (batchResult?.xlsx_url) {
      triggerDownload(batchResult.xlsx_url);
    }
  };

  const handleDownloadCsv = () => {
    if (batchResult?.csv_url) {
      triggerDownload(batchResult.csv_url);
    }
  };

  const currentAnnotations = annotations.filter((a) => a.pageNumber === currentPage);
  const pdfQueue = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* Header and Mode Selector */}
      <div className="border-b border-slate-800 pb-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FileEdit className="w-5 h-5 text-brand-400" />
              PDF Form Workstation
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Fill single interactive or flat forms, or batch-extract field data across 50+ filled PDFs into formatted Excel &amp; CSV.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800 self-start sm:self-auto shadow-inner">
            <button
              onClick={() => setMainMode('single')}
              className={`py-2 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                mainMode === 'single'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileEdit className="w-3.5 h-3.5" />
              Fill Single Form
            </button>
            <button
              onClick={() => setMainMode('batch')}
              className={`py-2 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                mainMode === 'batch'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              Batch Form Data to Excel / CSV
              {pdfQueue.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
                  {pdfQueue.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* VIEW 1: SINGLE FORM FILLING */}
      {mainMode === 'single' && (
        <>
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
                  Bakes field values directly into static page content and strips all interactive form widgets, preventing any PDF reader or viewer from altering them.
                </span>
              </div>
            </label>

            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lockPermissions}
                  onChange={(e) => setLockPermissions(e.target.checked)}
                  className="w-4 h-4 rounded text-brand-600 accent-brand-500 cursor-pointer mt-0.5"
                />
                <div className="flex-1">
                  <span className="text-xs font-semibold text-slate-200 block">
                    Lock Document Permissions (Read-Only Security)
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Restricts document editing even in full PDF editors without requiring a password to open.
                  </span>
                </div>
              </label>

              {lockPermissions && (
                <div className="pt-2.5 border-t border-slate-700/60 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-300 flex items-center gap-1">
                      <Key className="w-3 h-3 text-amber-400" /> Permissions Unlock Password
                    </span>
                    <span className="text-[10px] text-slate-400">Optional</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={permissionsPassword}
                      onChange={(e) => setPermissionsPassword(e.target.value)}
                      placeholder="e.g. MySecretPass2026 (or leave blank for LocalPDF_Unlock)"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:border-brand-500 outline-none pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    {permissionsPassword.trim() ? (
                      <span className="text-emerald-400 font-mono">
                        Password set to: "{permissionsPassword.trim()}". Remember this to unlock future edits.
                      </span>
                    ) : (
                      <span>
                        If left blank, default master password <code className="text-amber-300 font-mono">LocalPDF_Unlock</code> is applied.
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
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
        </>
      )}

      {/* VIEW 2: ENTERPRISE BATCH FORM EXTRACTION */}
      {mainMode === 'batch' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Queue & Batch Settings */}
            <div className="lg:col-span-5 space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Files className="w-3.5 h-3.5 text-brand-400" />
                    Form Document Queue ({pdfQueue.length})
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    {pdfQueue.length} {pdfQueue.length === 1 ? 'file' : 'files'} loaded
                  </span>
                </div>

                {pdfQueue.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl space-y-2">
                    <FileSpreadsheet className="w-8 h-8 mx-auto opacity-30 text-slate-400" />
                    <p>No PDF forms in queue.</p>
                    <p className="text-[11px] text-slate-600">Drop filled PDF forms in the dropzone above to begin.</p>
                  </div>
                ) : (
                  <div className="max-h-[280px] overflow-y-auto space-y-1.5 pr-1">
                    {pdfQueue.map((file, idx) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800/80 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          <span className="text-[10px] font-mono text-slate-500 w-4">{idx + 1}.</span>
                          <span className="truncate text-slate-300 font-medium" title={file.name}>
                            {file.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-slate-400">{formatSize(file.size)}</span>
                          <button
                            onClick={() => removeFile(file.id)}
                            className="text-slate-500 hover:text-red-400 transition"
                            title="Remove file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Output Filename & Format Specifications */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <label className="block text-xs font-semibold text-slate-300">
                  Export Filename Prefix
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={batchOutputName}
                    onChange={(e) => setBatchOutputName(e.target.value)}
                    placeholder="batch_form_export"
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                  <span className="text-xs text-slate-500 font-mono">.xlsx / .csv</span>
                </div>

                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="text-[11px] text-slate-400 font-medium">Export Bundle Includes:</div>
                  <div className="flex flex-col gap-1.5 text-[11px] text-slate-400">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span><strong>Excel Workbook (.xlsx):</strong> Formatted header, frozen panes, auto-fit widths, fill-rate stats sheet</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      <span><strong>RFC 4180 CSV:</strong> UTF-8 BOM encoding for direct, non-corrupted opening in Excel &amp; Pandas</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleBatchExport}
                disabled={batchProcessing || pdfQueue.length === 0}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 transition active:scale-[0.99] disabled:opacity-50"
              >
                {batchProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Extracting Schemas &amp; Exporting...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />
                    Extract All Form Data ({pdfQueue.length} PDF{pdfQueue.length === 1 ? '' : 's'})
                  </>
                )}
              </button>

              {batchError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{batchError}</span>
                </div>
              )}
            </div>

            {/* Right Column: Results & Interactive Preview */}
            <div className="lg:col-span-7 space-y-4">
              {!batchResult ? (
                <div className="p-8 rounded-2xl bg-slate-950/40 border border-slate-800/80 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                    <Table className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Batch Form Extraction Pipeline</h4>
                    <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                      Drop multiple filled PDF documents to automatically discover union schemas, extract text fields, checkbox states, and dropdown choices into master spreadsheets.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-800/60 max-w-lg mx-auto text-left">
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">Schema Union</div>
                      <div className="text-xs font-bold text-slate-200 mt-1">Auto-Discovered</div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Combines disparate form structures seamlessly</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">Type Coercion</div>
                      <div className="text-xs font-bold text-slate-200 mt-1">Smart Values</div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Text, Yes/No checks, &amp; dropdown choices</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">Local Execution</div>
                      <div className="text-xs font-bold text-slate-200 mt-1">In-Memory Engine</div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Fast local PDF form parsing and flattening</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Success Banner & Metrics */}
                  <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                        <CheckCircle2 className="w-4 h-4" />
                        Extraction Complete!
                      </div>
                      <span className="text-[11px] text-emerald-400/80 font-mono">
                        {batchResult.total_documents} documents &bull; {batchResult.total_fields} unique fields
                      </span>
                    </div>

                    {/* Download Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        onClick={handleDownloadXlsx}
                        className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-between shadow-lg shadow-emerald-600/20 transition active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-2.5">
                          <FileSpreadsheet className="w-5 h-5 flex-shrink-0" />
                          <div className="text-left">
                            <div className="text-xs font-bold">Download Excel (.xlsx)</div>
                            <div className="text-[10px] text-emerald-100">{batchResult.xlsx_filename} ({formatSize(batchResult.xlsx_size)})</div>
                          </div>
                        </div>
                        <Download className="w-4 h-4 opacity-80" />
                      </button>

                      <button
                        onClick={handleDownloadCsv}
                        className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-between border border-slate-700 shadow-md transition active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-2.5">
                          <Download className="w-5 h-5 text-blue-400 flex-shrink-0" />
                          <div className="text-left">
                            <div className="text-xs font-bold">Download CSV (.csv)</div>
                            <div className="text-[10px] text-slate-400">{batchResult.csv_filename} ({formatSize(batchResult.csv_size)})</div>
                          </div>
                        </div>
                        <Download className="w-4 h-4 opacity-80" />
                      </button>
                    </div>
                  </div>

                  {/* Sub-Tabs: Data Table vs Field Schema */}
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setBatchPreviewTab('data')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                            batchPreviewTab === 'data'
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Table className="w-3.5 h-3.5" />
                          Data Table Preview ({batchResult.preview_rows.length} rows)
                        </button>
                        <button
                          onClick={() => setBatchPreviewTab('schema')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                            batchPreviewTab === 'schema'
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <BarChart3 className="w-3.5 h-3.5 text-brand-400" />
                          Schema &amp; Fill Rates ({batchResult.schema.length} fields)
                        </button>
                      </div>
                    </div>

                    {/* TAB: DATA TABLE PREVIEW */}
                    {batchPreviewTab === 'data' && (
                      <div className="overflow-x-auto max-h-[380px] border border-slate-800/80 rounded-xl">
                        <table className="w-full text-[11px] text-left border-collapse">
                          <thead className="bg-slate-900 text-slate-300 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                              {batchResult.headers.map((h, i) => (
                                <th
                                  key={i}
                                  className={`px-3 py-2 border-b border-slate-800 whitespace-nowrap ${
                                    i < batchResult.metadata_column_count
                                      ? 'text-slate-400 font-mono text-[10px] bg-slate-950/80'
                                      : 'text-white'
                                  }`}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                            {batchResult.preview_rows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-slate-800/30 transition-colors">
                                {row.map((val, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className={`px-3 py-1.5 whitespace-nowrap truncate max-w-[200px] ${
                                      cIdx < batchResult.metadata_column_count
                                        ? 'text-slate-400 font-mono text-[10px]'
                                        : 'text-slate-200'
                                    }`}
                                    title={val}
                                  >
                                    {val || <span className="text-slate-600 italic">—</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* TAB: SCHEMA & FILL RATES */}
                    {batchPreviewTab === 'schema' && (
                      <div className="overflow-x-auto max-h-[380px] border border-slate-800/80 rounded-xl">
                        <table className="w-full text-[11px] text-left border-collapse">
                          <thead className="bg-slate-900 text-slate-300 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                              <th className="px-3 py-2 border-b border-slate-800">Field Name</th>
                              <th className="px-3 py-2 border-b border-slate-800">Type</th>
                              <th className="px-3 py-2 border-b border-slate-800">Presence</th>
                              <th className="px-3 py-2 border-b border-slate-800">Populated</th>
                              <th className="px-3 py-2 border-b border-slate-800 w-36">Fill Rate %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                            {batchResult.schema.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                                <td className="px-3 py-2 font-mono text-slate-200 font-medium">
                                  {item.field_name}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] uppercase font-mono text-slate-300">
                                    {item.type}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-slate-300">
                                  {item.documents_present}/{batchResult.total_documents} ({item.present_pct}%)
                                </td>
                                <td className="px-3 py-2 text-slate-300">
                                  {item.populated_count}/{batchResult.total_documents}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                      <div
                                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                                        style={{ width: `${item.fill_rate_pct}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
                                      {item.fill_rate_pct}%
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
