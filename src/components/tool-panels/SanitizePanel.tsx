import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import { PrivacyReport, SanitizeResult, BatchSanitizeResult } from '../../types';
import { formatSize } from '../../utils/formatters';
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  Trash2,
  Download,
  RefreshCw,
  AlertTriangle,
  FileText,
  Archive,
  CheckCircle2,
  Sliders,
  FileCode,
  Paperclip,
  MessageSquare,
  Layers,
  Sparkles,
  Info,
  Check,
} from 'lucide-react';

export const SanitizePanel: React.FC = () => {
  const { selectedFile, files, removeFile } = useAppStore();
  const { callApi, triggerDownload } = useSidecar();

  // Mode: 'single' vs 'batch'
  const [mode, setMode] = useState<'single' | 'batch'>('single');

  // Inspection state for active file
  const [inspecting, setInspecting] = useState(false);
  const [inspection, setInspection] = useState<PrivacyReport | null>(null);

  // Sanitization options
  const [stripMetadata, setStripMetadata] = useState(true);
  const [stripXmp, setStripXmp] = useState(true);
  const [stripAttachments, setStripAttachments] = useState(true);
  const [stripJs, setStripJs] = useState(true);
  const [stripActions, setStripActions] = useState(true);
  const [stripAnnotations, setStripAnnotations] = useState(true);
  const [keepFormWidgets, setKeepFormWidgets] = useState(true);
  const [stripHiddenLayers, setStripHiddenLayers] = useState(true);
  const [stripThumbnails, setStripThumbnails] = useState(true);
  const [linearize, setLinearize] = useState(true);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [singleResult, setSingleResult] = useState<SanitizeResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchSanitizeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));

  // Run privacy inspection when selectedFile changes
  useEffect(() => {
    if (!selectedFile || !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setInspection(null);
      return;
    }

    let isCancelled = false;
    const runInspect = async () => {
      setInspecting(true);
      setErrorMsg(null);
      try {
        const res = await callApi('/api/sanitize/inspect', { file_path: selectedFile.path });
        if (!isCancelled && res) {
          setInspection(res as PrivacyReport);
        }
      } catch (e: any) {
        if (!isCancelled) {
          console.warn('Privacy inspection error:', e);
        }
      } finally {
        if (!isCancelled) setInspecting(false);
      }
    };

    runInspect();
    return () => {
      isCancelled = true;
    };
  }, [selectedFile]);

  // Execute single file sanitization
  const handleSanitizeSingle = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setErrorMsg(null);
    setSingleResult(null);

    try {
      const res = await callApi('/api/sanitize/run', {
        file_path: selectedFile.path,
        strip_metadata: stripMetadata,
        strip_xmp: stripXmp,
        strip_attachments: stripAttachments,
        strip_javascript: stripJs,
        strip_actions: stripActions,
        strip_annotations: stripAnnotations,
        keep_form_widgets: keepFormWidgets,
        strip_hidden_layers: stripHiddenLayers,
        strip_thumbnails: stripThumbnails,
        linearize: linearize,
        output_filename: `sanitized_${selectedFile.name}`,
      });

      if (res && res.status === 'success') {
        setSingleResult(res as SanitizeResult);
      } else {
        setErrorMsg(res?.detail || 'Sanitization failed.');
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Error executing sanitization.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute batch sanitization
  const handleSanitizeBatch = async () => {
    const paths = pdfFiles.map((f) => f.path);
    if (paths.length === 0) {
      setErrorMsg('No PDF files found in queue.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setBatchResult(null);

    try {
      const res = await callApi('/api/sanitize/batch', {
        file_paths: paths,
        strip_metadata: stripMetadata,
        strip_xmp: stripXmp,
        strip_attachments: stripAttachments,
        strip_javascript: stripJs,
        strip_actions: stripActions,
        strip_annotations: stripAnnotations,
        keep_form_widgets: keepFormWidgets,
        strip_hidden_layers: stripHiddenLayers,
        strip_thumbnails: stripThumbnails,
        linearize: linearize,
      });

      if (res && res.status === 'success') {
        setBatchResult(res as BatchSanitizeResult);
      } else {
        setErrorMsg(res?.detail || 'Batch sanitization failed.');
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Error executing batch sanitization.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getThreatBadge = (level: string) => {
    switch (level) {
      case 'HIGH_EXPOSURE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> High Privacy Risk
          </span>
        );
      case 'MODERATE_EXPOSURE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Moderate Exposure
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Clean / Minimal Metadata
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* Top Header */}
      <div className="border-b border-slate-800 pb-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-brand-400" />
              Deep Metadata Sanitizer &amp; Privacy Purge
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              DoD/NSA 5200.01 compliant sanitization. Destroys hidden metadata, Adobe XMP packets, comments, JavaScript, and unreferenced revision streams.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800 self-start sm:self-auto shadow-inner">
            <button
              onClick={() => setMode('single')}
              className={`py-2 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                mode === 'single'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Active Document
            </button>
            <button
              onClick={() => setMode('batch')}
              className={`py-2 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                mode === 'batch'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              Batch Purge ({pdfFiles.length})
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Privacy Purge Settings Checklist */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-brand-400" />
                Sanitization Checklist
              </h3>
              <button
                onClick={() => {
                  setStripMetadata(true);
                  setStripXmp(true);
                  setStripAttachments(true);
                  setStripJs(true);
                  setStripActions(true);
                  setStripAnnotations(true);
                  setStripHiddenLayers(true);
                  setStripThumbnails(true);
                  setLinearize(true);
                }}
                className="text-[11px] text-brand-400 hover:text-brand-300 font-medium"
              >
                Select DoD Standard
              </button>
            </div>

            {/* Granular Item Switches */}
            <div className="space-y-2.5 pt-1">
              <label className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={stripMetadata}
                  onChange={(e) => setStripMetadata(e.target.checked)}
                  className="mt-0.5 accent-brand-500 rounded"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-200">Document Info Dictionary (/Info)</div>
                  <div className="text-[11px] text-slate-400">Purges Author, Title, Creator, Producer, and edit timestamps.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={stripXmp}
                  onChange={(e) => setStripXmp(e.target.checked)}
                  className="mt-0.5 accent-brand-500 rounded"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-200">Adobe XMP Metadata Packet</div>
                  <div className="text-[11px] text-slate-400">Removes XML editing history, computer usernames, and document UUIDs.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={stripJs}
                  onChange={(e) => setStripJs(e.target.checked)}
                  className="mt-0.5 accent-brand-500 rounded"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-200">JavaScript &amp; OpenActions</div>
                  <div className="text-[11px] text-slate-400">Purges interactive scripts, automatic execution triggers, and launch macros.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={stripAttachments}
                  onChange={(e) => setStripAttachments(e.target.checked)}
                  className="mt-0.5 accent-brand-500 rounded"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-200">Embedded File Attachments</div>
                  <div className="text-[11px] text-slate-400">Removes companion files, spreadsheets, and hidden embedded archives.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={stripAnnotations}
                  onChange={(e) => setStripAnnotations(e.target.checked)}
                  className="mt-0.5 accent-brand-500 rounded"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-200">Review Comments &amp; Sticky Notes</div>
                  <div className="text-[11px] text-slate-400">Wipes editorial notes, margin comments, and reviewer popups.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={stripHiddenLayers}
                  onChange={(e) => setStripHiddenLayers(e.target.checked)}
                  className="mt-0.5 accent-brand-500 rounded"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-200">Hidden Layers (OCG Properties)</div>
                  <div className="text-[11px] text-slate-400">Purges invisible CAD/drawing layers and watermark overlays.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={linearize}
                  onChange={(e) => setLinearize(e.target.checked)}
                  className="mt-0.5 accent-brand-500 rounded"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-200">Linearize &amp; Rebuild Object Streams</div>
                  <div className="text-[11px] text-slate-400">Reconstructs PDF from zero, permanently wiping unreferenced revision streams.</div>
                </div>
              </label>
            </div>
          </div>

          {/* Action Trigger Button */}
          {mode === 'single' ? (
            <button
              onClick={handleSanitizeSingle}
              disabled={isProcessing || !selectedFile}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-red-500/25 transition active:scale-[0.99] disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Sanitizing Document...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Sanitize &amp; Rebuild Document
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleSanitizeBatch}
              disabled={isProcessing || pdfFiles.length === 0}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-red-500/25 transition active:scale-[0.99] disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Purging Batch Documents...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Purge &amp; Sanitize All ({pdfFiles.length} PDFs)
                </>
              )}
            </button>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Right Column: Deep Privacy Audit Report & Post-Sanitization Results */}
        <div className="lg:col-span-7 space-y-4">
          {mode === 'single' ? (
            <>
              {/* Privacy Exposure Inspection Audit */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    Privacy Exposure Audit
                  </h3>
                  {inspection && getThreatBadge(inspection.threat_level)}
                </div>

                {inspecting ? (
                  <div className="py-8 text-center text-slate-400 text-xs space-y-2">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-brand-400" />
                    <p>Scanning object streams and metadata dictionaries...</p>
                  </div>
                ) : inspection ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">DocInfo Metadata</div>
                      <div className="text-xs font-bold text-slate-200 mt-1 flex items-center gap-1">
                        {inspection.has_metadata ? (
                          <span className="text-amber-400 font-semibold">Detected</span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">None</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {Object.keys(inspection.metadata_items || {}).length} keys recorded
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">Adobe XMP Stream</div>
                      <div className="text-xs font-bold text-slate-200 mt-1">
                        {inspection.has_xmp ? (
                          <span className="text-amber-400 font-semibold">{formatSize(inspection.xmp_size)}</span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">Clean</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Edit lineage XML</p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">JavaScript / Actions</div>
                      <div className="text-xs font-bold text-slate-200 mt-1">
                        {inspection.has_javascript || inspection.has_actions ? (
                          <span className="text-red-400 font-semibold">Active Scripts</span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">None</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {inspection.javascript_count} scripts detected
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">Embedded Files</div>
                      <div className="text-xs font-bold text-slate-200 mt-1">
                        {inspection.has_attachments ? (
                          <span className="text-red-400 font-semibold">{inspection.embedded_files.length} Files</span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">None</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Secret attachments</p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">Annotations &amp; Notes</div>
                      <div className="text-xs font-bold text-slate-200 mt-1">
                        {inspection.annotations_count > 0 ? (
                          <span className="text-amber-400 font-semibold">{inspection.annotations_count} Items</span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">Clean</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Reviewer comments</p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">Hidden Layers</div>
                      <div className="text-xs font-bold text-slate-200 mt-1">
                        {inspection.has_hidden_layers ? (
                          <span className="text-amber-400 font-semibold">OCG Layers</span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">None</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">CAD / invisible drafts</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">Select a PDF to inspect privacy leakage.</p>
                )}
              </div>

              {/* Sanitization Results Certificate */}
              {singleResult && (
                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4" />
                      Document Successfully Sanitized!
                    </div>
                    <span className="text-[11px] text-emerald-400/80 font-mono">
                      Linearized &bull; Zero Leaks
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-emerald-900/30 border border-emerald-800/40">
                      <div className="text-[10px] text-emerald-300">Original Size</div>
                      <div className="text-xs font-mono font-bold text-white">
                        {formatSize(singleResult.original_size)}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-900/30 border border-emerald-800/40">
                      <div className="text-[10px] text-emerald-300">Sanitized Size</div>
                      <div className="text-xs font-mono font-bold text-white">
                        {formatSize(singleResult.sanitized_size)}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-900/30 border border-emerald-800/40">
                      <div className="text-[10px] text-emerald-300">Bytes Stripped</div>
                      <div className="text-xs font-mono font-bold text-emerald-400">
                        {formatSize(Math.max(0, singleResult.bytes_saved))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="text-[11px] font-semibold text-emerald-300">Items Purged:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {singleResult.items_stripped.map((item, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-full bg-emerald-900/50 border border-emerald-700/50 text-[10px] text-emerald-200"
                        >
                          &bull; {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => triggerDownload(singleResult.download_url)}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-[0.99]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Sanitized PDF ({singleResult.output_filename})
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Batch Mode Results & Queue */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Archive className="w-3.5 h-3.5 text-brand-400" />
                    Batch Document Queue ({pdfFiles.length})
                  </h3>
                </div>

                <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
                  {pdfFiles.map((file, idx) => (
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
              </div>

              {batchResult && (
                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4" />
                      Batch Sanitization Complete!
                    </div>
                    <span className="text-[11px] text-emerald-400/80 font-mono">
                      {batchResult.successful_count} / {batchResult.total_documents} documents purged
                    </span>
                  </div>

                  <button
                    onClick={() => triggerDownload(batchResult.zip_url)}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-[0.99]"
                  >
                    <Download className="w-4 h-4" />
                    Download All Sanitized Documents ({batchResult.zip_filename})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
