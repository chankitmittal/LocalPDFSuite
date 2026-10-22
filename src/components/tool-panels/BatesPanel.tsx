import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import { BatesStampResult, UploadedFile } from '../../types';
import { formatSize } from '../../utils/formatters';
import {
  Hash,
  FileText,
  ArrowUp,
  ArrowDown,
  Trash2,
  Download,
  FileSpreadsheet,
  Archive,
  CheckCircle2,
  ShieldCheck,
  Info,
  Scale,
  Settings2,
  Stamp,
  Layers,
  RefreshCw,
} from 'lucide-react';

export const BatesPanel: React.FC = () => {
  const { files, removeFile } = useAppStore();
  const { callApi, triggerDownload, getBaseUrl } = useSidecar();

  // Filter only PDF files
  const pdfFiles = useMemo(
    () => files.filter((f) => f.name.toLowerCase().endsWith('.pdf')),
    [files]
  );

  // File queue ordering
  const [orderedFileIds, setOrderedFileIds] = useState<string[]>([]);

  // Sync ordered files with available files
  const queueFiles = useMemo(() => {
    const map = new Map(pdfFiles.map((f) => [f.id, f]));
    const list: UploadedFile[] = [];

    // Keep existing order
    for (const id of orderedFileIds) {
      if (map.has(id)) {
        list.push(map.get(id)!);
        map.delete(id);
      }
    }
    // Append any newly added PDFs
    for (const remaining of map.values()) {
      list.push(remaining);
    }
    return list;
  }, [pdfFiles, orderedFileIds]);

  // Bates Numbering Settings
  const [prefix, setPrefix] = useState<string>('CASE-');
  const [suffix, setSuffix] = useState<string>('');
  const [startNumber, setStartNumber] = useState<number>(1);
  const [paddingDigits, setPaddingDigits] = useState<number>(6);
  const [batesPosition, setBatesPosition] = useState<string>('bottom-right');

  // Exhibit / Confidentiality Stamp Settings
  const [enableExhibit, setEnableExhibit] = useState<boolean>(false);
  const [exhibitText, setExhibitText] = useState<string>('CONFIDENTIAL - ATTORNEYS\' EYES ONLY');
  const [exhibitPosition, setExhibitPosition] = useState<string>('top-right');

  // Styling & Anti-collision
  const [fontFamily, setFontFamily] = useState<string>('Helvetica');
  const [fontSize, setFontSize] = useState<number>(10);
  const [hexColor, setHexColor] = useState<string>('#000000');
  const [margin, setMargin] = useState<number>(36);
  const [shrinkContent, setShrinkContent] = useState<boolean>(true);

  // Page targeting
  const [targetPages, setTargetPages] = useState<'all' | 'exclude_first' | 'custom'>('all');
  const [customRange, setCustomRange] = useState<string>('');

  // Export options
  const [generateCsvIndex, setGenerateCsvIndex] = useState<boolean>(true);
  const [generateZip, setGenerateZip] = useState<boolean>(true);

  // Processing state & Results
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [batesResult, setBatesResult] = useState<BatesStampResult | null>(null);

  // Queue reordering
  const moveFile = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= queueFiles.length) return;

    const copy = [...queueFiles];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;

    setOrderedFileIds(copy.map((f) => f.id));
  };

  // Live sequence preview
  const previewStart = `${prefix}${String(startNumber).padStart(paddingDigits, '0')}${suffix}`;
  const previewSampleSecond = `${prefix}${String(startNumber + 1).padStart(paddingDigits, '0')}${suffix}`;

  // Execute Bates Stamping
  const handleApplyBates = async () => {
    if (queueFiles.length === 0) return;
    setIsProcessing(true);
    setBatesResult(null);

    try {
      const res = await callApi('/api/bates/apply', {
        file_paths: queueFiles.map((f) => f.path),
        prefix,
        suffix,
        start_number: startNumber,
        padding_digits: paddingDigits,
        bates_position: batesPosition,
        exhibit_text: enableExhibit ? exhibitText : null,
        exhibit_position: exhibitPosition,
        font_family: fontFamily,
        font_size: fontSize,
        hex_color: hexColor,
        margin,
        shrink_content: shrinkContent,
        target_pages: targetPages,
        custom_range: customRange,
        generate_csv_index: generateCsvIndex,
        generate_zip: generateZip,
      });

      if (res && res.status === 'success') {
        setBatesResult(res as BatesStampResult);
      }
    } catch (err) {
      console.error('Error applying Bates numbering:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (pdfFiles.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center max-w-2xl mx-auto shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-brand-500/10 text-brand-400 mx-auto flex items-center justify-center mb-5 border border-brand-500/20 shadow-inner">
          <Hash className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Bates Numbering & Legal Stamping</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Please upload one or more PDF files to apply continuous litigation Bates stamping, exhibit labels,
          anti-collision margins, and automated e-Discovery CSV index generation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header & Live Counter Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-400 flex items-center justify-center font-bold">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Bates Numbering & Legal Stamping
                <span className="text-[10px] bg-brand-500/20 text-brand-300 border border-brand-500/30 px-2 py-0.5 rounded-full font-semibold">
                  PRO Legal Suite
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Continuous running sequence numbering across {queueFiles.length} document{queueFiles.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Live Bates Sequence Badge */}
          <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-xl text-xs font-mono">
            <span className="text-slate-400">Sequence Preview:</span>
            <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              {previewStart}
            </span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-slate-300">{previewSampleSecond}</span>
            <span className="text-slate-500">...</span>
          </div>
        </div>
      </div>

      {/* 2. Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Settings & Configuration */}
        <div className="lg:col-span-7 space-y-4">
          {/* Card A: Numbering Parameters */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
              <Settings2 className="w-4 h-4 text-brand-400" />
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                1. Numbering Sequence & Prefix
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-medium">Prefix</label>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="e.g. CASE-, LIT-"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-medium">Suffix (Optional)</label>
                <input
                  type="text"
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  placeholder="e.g. -CONF, -EXH"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-medium">Starting Number</label>
                <input
                  type="number"
                  min="1"
                  value={startNumber}
                  onChange={(e) => setStartNumber(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-medium">Zero-Padding Digits</label>
                <select
                  value={paddingDigits}
                  onChange={(e) => setPaddingDigits(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-brand-500 cursor-pointer"
                >
                  <option value="3">3 digits (001)</option>
                  <option value="4">4 digits (0001)</option>
                  <option value="5">5 digits (00001)</option>
                  <option value="6">6 digits (000001) - Legal Standard</option>
                  <option value="7">7 digits (0000001)</option>
                  <option value="8">8 digits (00000001)</option>
                  <option value="9">9 digits (000000001)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card B: Placement Zones */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Stamp className="w-4 h-4 text-brand-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  2. Bates Stamp Placement Zone
                </h3>
              </div>
              <span className="text-[11px] font-mono text-brand-300 uppercase font-semibold">
                {batesPosition}
              </span>
            </div>

            {/* 3x2 Zone Selector Grid */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { id: 'top-left', label: 'Top Left' },
                { id: 'top-center', label: 'Top Center' },
                { id: 'top-right', label: 'Top Right' },
                { id: 'bottom-left', label: 'Bottom Left' },
                { id: 'bottom-center', label: 'Bottom Center' },
                { id: 'bottom-right', label: 'Bottom Right (Standard)' },
              ].map((zone) => (
                <button
                  key={zone.id}
                  onClick={() => setBatesPosition(zone.id)}
                  className={`p-2.5 rounded-xl border text-center transition font-medium ${
                    batesPosition === zone.id
                      ? 'bg-brand-600 text-white border-brand-500 shadow-md ring-2 ring-brand-500/30'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {zone.label}
                </button>
              ))}
            </div>
          </div>

          {/* Card C: Optional Exhibit / Confidentiality Header */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableExhibit}
                  onChange={(e) => setEnableExhibit(e.target.checked)}
                  className="rounded text-brand-500 focus:ring-brand-500 bg-slate-950 border-slate-700"
                />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  3. Add Exhibit / Confidentiality Stamp
                </span>
              </label>
              {enableExhibit && (
                <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded font-semibold">
                  Active
                </span>
              )}
            </div>

            {enableExhibit && (
              <div className="space-y-3 pt-1 text-xs">
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Exhibit / Disclaimer Text</label>
                  <input
                    type="text"
                    value={exhibitText}
                    onChange={(e) => setExhibitText(e.target.value)}
                    placeholder="e.g. CONFIDENTIAL - ATTORNEYS' EYES ONLY"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Exhibit Position</label>
                  <select
                    value={exhibitPosition}
                    onChange={(e) => setExhibitPosition(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="top-left">Top Left</option>
                    <option value="top-center">Top Center</option>
                    <option value="top-right">Top Right (Standard for Exhibits)</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="bottom-center">Bottom Center</option>
                    <option value="bottom-right">Bottom Right</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Card D: Anti-Collision & Page Options */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
              <Scale className="w-4 h-4 text-brand-400" />
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                4. Anti-Collision & Page Targeting
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              {/* Anti-collision shrink toggle */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={shrinkContent}
                  onChange={(e) => setShrinkContent(e.target.checked)}
                  className="rounded text-brand-500 focus:ring-brand-500 bg-slate-900 border-slate-700 mt-0.5"
                />
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    Shrink page content by 5% (Anti-Collision Protection)
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-semibold">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Scales document contents slightly inwards to create a safe white margin gutter, preventing
                    Bates stamps from overwriting signatures, fine print, or existing page numbers.
                  </p>
                </div>
              </label>

              {/* Target pages */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'all', label: 'All Pages' },
                  { id: 'exclude_first', label: 'Skip Cover Page (P.1)' },
                  { id: 'custom', label: 'Custom Range' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setTargetPages(opt.id as any)}
                    className={`py-2 px-3 rounded-xl border text-center transition font-medium ${
                      targetPages === opt.id
                        ? 'bg-brand-600 text-white border-brand-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {targetPages === 'custom' && (
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Custom Page Range</label>
                  <input
                    type="text"
                    value={customRange}
                    onChange={(e) => setCustomRange(e.target.value)}
                    placeholder="e.g. 1, 3-5, 8"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Card E: Typography & Styling */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
              <span className="font-bold text-xs text-slate-200 uppercase tracking-wider">
                5. Typography & Margins
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-medium">Font Family</label>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 text-xs focus:outline-none cursor-pointer"
                >
                  <option value="Helvetica">Helvetica (Sans)</option>
                  <option value="Times">Times (Serif)</option>
                  <option value="Courier">Courier (Mono)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-medium">Font Size</label>
                <select
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 text-xs focus:outline-none cursor-pointer"
                >
                  <option value="8">8 pt (Compact)</option>
                  <option value="9">9 pt</option>
                  <option value="10">10 pt (Standard)</option>
                  <option value="12">12 pt (Large)</option>
                  <option value="14">14 pt</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-medium">Ink Color</label>
                <select
                  value={hexColor}
                  onChange={(e) => setHexColor(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 text-xs focus:outline-none cursor-pointer"
                >
                  <option value="#000000">Black (#000000)</option>
                  <option value="#1E3A8A">Navy Blue (#1E3A8A)</option>
                  <option value="#DC2626">Red (#DC2626)</option>
                  <option value="#475569">Slate Gray (#475569)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-medium">Margin</label>
                <select
                  value={margin}
                  onChange={(e) => setMargin(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 text-xs focus:outline-none cursor-pointer"
                >
                  <option value="18">18 pt (0.25 in)</option>
                  <option value="28">28 pt</option>
                  <option value="36">36 pt (0.50 in Standard)</option>
                  <option value="54">54 pt (0.75 in)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: File Queue, Visual Mockup & Actions */}
        <div className="lg:col-span-5 space-y-4">
          {/* Document Queue Ordering */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-brand-400" />
                Document Queue ({queueFiles.length})
              </span>
              <span className="text-[11px] text-slate-400">Order determines sequence</span>
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {queueFiles.map((file, idx) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-brand-500/10 text-brand-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-slate-200 font-medium truncate max-w-[180px]">{file.name}</div>
                      <div className="text-[10px] text-slate-500">{formatSize(file.size)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => moveFile(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20 transition"
                      title="Move Up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveFile(idx, 'down')}
                      disabled={idx === queueFiles.length - 1}
                      className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20 transition"
                      title="Move Down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeFile(file.id)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 transition"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Visual Mockup Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <span className="text-xs font-bold text-slate-300 block pb-1 border-b border-slate-800">
              Live Stamp Layout Mockup
            </span>

            <div className="w-full aspect-[4/3] bg-white rounded-xl p-4 relative shadow-inner overflow-hidden select-none border border-slate-700">
              {/* Content representation */}
              <div
                className={`w-full h-full border border-dashed border-slate-300 rounded p-4 flex flex-col justify-between transition-all ${
                  shrinkContent ? 'scale-95' : 'scale-100'
                }`}
              >
                <div className="space-y-2 opacity-30">
                  <div className="h-3 bg-slate-400 rounded w-3/4" />
                  <div className="h-2 bg-slate-300 rounded w-full" />
                  <div className="h-2 bg-slate-300 rounded w-5/6" />
                  <div className="h-2 bg-slate-300 rounded w-4/5" />
                </div>
                <div className="text-center text-[10px] text-slate-400 font-mono">
                  {shrinkContent ? '[Content scaled by 5% for safe margin]' : '[Standard Page Content]'}
                </div>
                <div className="space-y-2 opacity-30">
                  <div className="h-2 bg-slate-300 rounded w-full" />
                  <div className="h-2 bg-slate-300 rounded w-2/3" />
                </div>
              </div>

              {/* Bates Stamp indicator */}
              <div
                className={`absolute font-mono font-bold text-[11px] px-2 py-0.5 rounded shadow-sm transition-all ${
                  batesPosition.includes('top') ? 'top-2' : 'bottom-2'
                } ${
                  batesPosition.includes('left')
                    ? 'left-2'
                    : batesPosition.includes('center')
                    ? 'left-1/2 -translate-x-1/2'
                    : 'right-2'
                }`}
                style={{ color: hexColor }}
              >
                {previewStart}
              </div>

              {/* Exhibit Stamp indicator */}
              {enableExhibit && exhibitText && (
                <div
                  className={`absolute font-mono font-bold text-[10px] px-2 py-0.5 rounded shadow-sm transition-all ${
                    exhibitPosition.includes('top') ? 'top-2' : 'bottom-2'
                  } ${
                    exhibitPosition.includes('left')
                      ? 'left-2'
                      : exhibitPosition.includes('center')
                      ? 'left-1/2 -translate-x-1/2'
                      : 'right-2'
                  }`}
                  style={{ color: hexColor }}
                >
                  {exhibitText}
                </div>
              )}
            </div>
          </div>

          {/* Apply Bates Stamping Button */}
          <button
            onClick={handleApplyBates}
            disabled={isProcessing || queueFiles.length === 0}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-brand-500/25 transition active:scale-[0.99] disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Stamping {queueFiles.length} Document{queueFiles.length > 1 ? 's' : ''}...
              </>
            ) : (
              <>
                <Hash className="w-4 h-4" />
                Apply Bates Numbering ({queueFiles.length} File{queueFiles.length > 1 ? 's' : ''})
              </>
            )}
          </button>

          {/* Results Summary & Download Card */}
          {batesResult && (
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 space-y-3 shadow-xl">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4" />
                Bates Stamping Complete!
              </div>

              <div className="text-xs text-slate-300 space-y-1 font-mono bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Pages:</span>
                  <span className="text-white font-bold">{batesResult.total_pages_stamped}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Range:</span>
                  <span className="text-emerald-400 font-bold">
                    {batesResult.start_bates} &rarr; {batesResult.end_bates}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                {/* Download ZIP Bundle */}
                {batesResult.zip_path && (
                  <button
                    onClick={() =>
                      triggerDownload(
                        `${getBaseUrl()}/api/files/download?path=${encodeURIComponent(batesResult.zip_path!)}`,
                        `bates_bundle_${Date.now()}.zip`
                      )
                    }
                    className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow transition"
                  >
                    <Archive className="w-4 h-4" />
                    Download All Stamped PDFs + CSV Index (.zip)
                  </button>
                )}

                {/* Download CSV Index */}
                {batesResult.index_csv_path && (
                  <button
                    onClick={() =>
                      triggerDownload(
                        `${getBaseUrl()}/api/files/download?path=${encodeURIComponent(batesResult.index_csv_path!)}`,
                        `bates_index.csv`
                      )
                    }
                    className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 transition"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    Download e-Discovery Index (.csv)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
