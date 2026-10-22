import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import {
  PipelineStep,
  WorkflowPreset,
  BatchPipelineResult,
} from '../../types';
import { formatSize } from '../../utils/formatters';
import {
  Workflow,
  CheckCheck,
  Play,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileText,
  Sliders,
  Scale,
  ShieldCheck,
  Archive,
  Layers,
  Lock,
  Stamp,
  Minimize2,
  Shield,
  HelpCircle,
  Eye,
  EyeOff,
} from 'lucide-react';

const STEP_ICONS: Record<string, React.ElementType> = {
  compress: Minimize2,
  watermark: Stamp,
  bates: Scale,
  sanitize: ShieldCheck,
  flatten: Layers,
  protect: Lock,
};

const STEP_TITLES: Record<string, string> = {
  compress: 'File Compression',
  watermark: 'Text Watermark',
  bates: 'Bates Legal Numbering',
  sanitize: 'DoD Metadata Sanitization',
  flatten: 'Burn Form Annotations',
  protect: 'Password Protection',
};

const DEFAULT_PRESETS: WorkflowPreset[] = [
  {
    id: 'courtroom_filing',
    name: 'Courtroom Legal Bundle',
    description: 'Bates numbering with anti-collision margin protection, permanent annotation flattening, and deep DoD metadata wipe.',
    steps: [
      {
        type: 'bates',
        params: {
          prefix: 'EXHIBIT-',
          suffix: '',
          start_number: 1,
          padding_digits: 6,
          bates_position: 'bottom-right',
          shrink_content: true,
          font_size: 10,
          hex_color: '#000000',
          target_pages: 'all',
          exhibit_text: '',
          exhibit_position: 'top-right',
        },
      },
      {
        type: 'flatten',
        params: { lock_permissions: true },
      },
      {
        type: 'sanitize',
        params: {
          strip_metadata: true,
          strip_xmp: true,
          strip_javascript: true,
          strip_attachments: true,
          strip_annotations: true,
          keep_form_widgets: false,
          strip_hidden_layers: true,
          linearize: true,
        },
      },
    ],
  },
  {
    id: 'confidential_review',
    name: 'Confidential External Review',
    description: 'Prominent diagonal "CONFIDENTIAL" watermark, balanced 150 DPI compression for email sharing, and revision stream wipe.',
    steps: [
      {
        type: 'watermark',
        params: {
          text: 'CONFIDENTIAL - DRAFT',
          font_size: 36,
          opacity: 0.25,
          rotation: 45,
          hex_color: '#ef4444',
          tiled: false,
        },
      },
      {
        type: 'compress',
        params: { level: 'medium' },
      },
      {
        type: 'sanitize',
        params: {
          strip_metadata: true,
          strip_xmp: true,
          strip_javascript: true,
          strip_attachments: true,
          strip_annotations: true,
          linearize: true,
        },
      },
    ],
  },
  {
    id: 'archival_prep',
    name: 'Archival & Long-Term Preservation',
    description: 'Flattens dynamic fields, strips JavaScript/macros, purges embedded files, and linearizes object streams for permanent storage.',
    steps: [
      {
        type: 'flatten',
        params: { lock_permissions: false },
      },
      {
        type: 'sanitize',
        params: {
          strip_metadata: false,
          strip_xmp: false,
          strip_javascript: true,
          strip_attachments: true,
          strip_annotations: true,
          linearize: true,
        },
      },
      {
        type: 'compress',
        params: { level: 'medium' },
      },
    ],
  },
  {
    id: 'public_disclosure',
    name: 'Public Disclosure / FOIA Release',
    description: 'Complete DocInfo & XMP wipe, annotation flattening, hidden CAD layer removal, and web streaming optimization.',
    steps: [
      {
        type: 'sanitize',
        params: {
          strip_metadata: true,
          strip_xmp: true,
          strip_javascript: true,
          strip_attachments: true,
          strip_annotations: true,
          keep_form_widgets: false,
          strip_hidden_layers: true,
          linearize: true,
        },
      },
      {
        type: 'compress',
        params: { level: 'medium' },
      },
    ],
  },
];

export const ActionWizardPanel: React.FC = () => {
  const { files, removeFile } = useAppStore();
  const { callApi, triggerDownload } = useSidecar();

  const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));

  // Active steps in pipeline
  const [activePresetId, setActivePresetId] = useState<string>('courtroom_filing');
  const [steps, setSteps] = useState<PipelineStep[]>(DEFAULT_PRESETS[0].steps);
  const [outputPrefix, setOutputPrefix] = useState('pipelined_');

  // Processing & Results
  const [isProcessing, setIsProcessing] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<BatchPipelineResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showUserPwd, setShowUserPwd] = useState<Record<number, boolean>>({});
  const [showOwnerPwd, setShowOwnerPwd] = useState<Record<number, boolean>>({});

  // Apply preset
  const handleSelectPreset = (preset: WorkflowPreset) => {
    setActivePresetId(preset.id);
    setSteps([...preset.steps]);
    setPipelineResult(null);
    setErrorMessage(null);
  };

  // Step manipulation
  const handleAddStep = (type: PipelineStep['type']) => {
    setActivePresetId('custom');
    let defaultParams: Record<string, any> = {};
    if (type === 'compress') {
      defaultParams = { level: 'medium' };
    } else if (type === 'watermark') {
      defaultParams = {
        text: 'CONFIDENTIAL',
        font_size: 36,
        opacity: 0.25,
        rotation: 45,
        hex_color: '#ef4444',
        tiled: false,
      };
    } else if (type === 'bates') {
      defaultParams = {
        prefix: 'DOC-',
        suffix: '',
        start_number: 1,
        padding_digits: 6,
        bates_position: 'bottom-right',
        shrink_content: true,
        font_size: 10,
        hex_color: '#000000',
        target_pages: 'all',
        exhibit_text: '',
        exhibit_position: 'top-right',
      };
    } else if (type === 'sanitize') {
      defaultParams = {
        strip_metadata: true,
        strip_xmp: true,
        strip_javascript: true,
        strip_attachments: true,
        strip_annotations: true,
        keep_form_widgets: true,
        strip_hidden_layers: true,
        linearize: true,
      };
    } else if (type === 'flatten') {
      defaultParams = { lock_permissions: true };
    } else if (type === 'protect') {
      defaultParams = { user_password: '', owner_password: '' };
    }

    setSteps([...steps, { type, params: defaultParams }]);
  };

  const handleRemoveStep = (index: number) => {
    setActivePresetId('custom');
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= steps.length) return;
    setActivePresetId('custom');
    const newSteps = [...steps];
    const temp = newSteps[index];
    newSteps[index] = newSteps[targetIdx];
    newSteps[targetIdx] = temp;
    setSteps(newSteps);
  };

  const handleUpdateStepParam = (index: number, key: string, value: any) => {
    setActivePresetId('custom');
    const newSteps = [...steps];
    newSteps[index] = {
      ...newSteps[index],
      params: { ...newSteps[index].params, [key]: value },
    };
    setSteps(newSteps);
  };

  // Run pipeline
  const handleRunPipeline = async () => {
    const paths = pdfFiles.map((f) => f.path);
    if (paths.length === 0) {
      setErrorMessage('No PDF files found in queue. Please drop documents in the dropzone above.');
      return;
    }
    if (steps.length === 0) {
      setErrorMessage('Pipeline must contain at least one action step.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setPipelineResult(null);

    try {
      const res = await callApi('/api/pipeline/run', {
        file_paths: paths,
        steps,
        output_prefix: outputPrefix.trim() || 'pipelined_',
        bundle_zip: true,
      });

      if (res && res.status === 'success') {
        setPipelineResult(res as BatchPipelineResult);
      } else {
        setErrorMessage(res?.detail || 'Pipeline execution encountered errors.');
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Error executing pipeline.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* Top Header */}
      <div className="border-b border-slate-800 pb-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Workflow className="w-5 h-5 text-brand-400" />
            Batch Action Wizard &amp; Automation Pipeline
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Build and execute sequential multi-step workflow pipelines across 50+ PDF documents simultaneously.
          </p>
        </div>

        {/* Preset Recipe Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {DEFAULT_PRESETS.map((preset) => {
            const isSelected = activePresetId === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-brand-600/15 border-brand-500 shadow-md shadow-brand-500/10'
                    : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-white truncate">{preset.name}</span>
                    {isSelected && <CheckCheck className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {preset.description}
                  </p>
                </div>
                <div className="flex items-center gap-1 mt-3 pt-2 border-t border-slate-800/60 text-[10px] text-slate-400 font-mono">
                  {preset.steps.map((s, idx) => (
                    <React.Fragment key={idx}>
                      <span className="capitalize">{s.type}</span>
                      {idx < preset.steps.length - 1 && <span>&rarr;</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Visual Pipeline Sequence Builder */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Workflow className="w-3.5 h-3.5 text-brand-400" />
                Workflow Pipeline Steps ({steps.length})
              </h3>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-slate-400">Add Step:</span>
                {(['compress', 'watermark', 'bates', 'sanitize', 'flatten', 'protect'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => handleAddStep(t)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] capitalize transition"
                  >
                    +{t}
                  </button>
                ))}
              </div>
            </div>

            {/* Chained Step Cards */}
            {steps.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                No steps in pipeline. Choose a preset or add steps above.
              </div>
            ) : (
              <div className="space-y-3">
                {steps.map((step, idx) => {
                  const Icon = STEP_ICONS[step.type] || Sliders;
                  const title = STEP_TITLES[step.type] || step.type;

                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition space-y-3 relative group shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 text-[10px] font-mono font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <Icon className="w-4 h-4 text-brand-400" />
                          <span className="text-xs font-bold text-white">{title}</span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                            {step.type}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleMoveStep(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 text-slate-500 hover:text-white disabled:opacity-30"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMoveStep(idx, 'down')}
                            disabled={idx === steps.length - 1}
                            className="p-1 text-slate-500 hover:text-white disabled:opacity-30"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRemoveStep(idx)}
                            className="p-1 text-slate-500 hover:text-red-400 ml-1"
                            title="Remove Step"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Step Specific Inline Parameters */}
                      <div className="pt-2 border-t border-slate-800/80 space-y-2.5 text-xs">
                        {/* 1. COMPRESS STEP */}
                        {step.type === 'compress' && (
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-slate-300">Compression Profile</label>
                            <select
                              value={step.params.level || step.params.mode || 'medium'}
                              onChange={(e) => handleUpdateStepParam(idx, 'level', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                            >
                              <option value="medium">Balanced (144 DPI, 70% Quality) - Recommended</option>
                              <option value="extreme">Extreme Web (72 DPI, 50% Quality) - Maximum Compression</option>
                              <option value="low">High Quality (200 DPI, 85% Quality) - For Sharp Printing</option>
                            </select>
                          </div>
                        )}

                        {/* 2. WATERMARK STEP */}
                        {step.type === 'watermark' && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-2">
                              <div className="col-span-2 space-y-1">
                                <label className="text-[10px] text-slate-400">Watermark Text</label>
                                <input
                                  type="text"
                                  value={step.params.text || 'CONFIDENTIAL'}
                                  onChange={(e) => handleUpdateStepParam(idx, 'text', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400">Font Size (pt)</label>
                                <input
                                  type="number"
                                  min="12"
                                  max="72"
                                  value={step.params.font_size || 36}
                                  onChange={(e) => handleUpdateStepParam(idx, 'font_size', parseInt(e.target.value) || 36)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400">Angle</label>
                                <select
                                  value={step.params.rotation !== undefined ? step.params.rotation : 45}
                                  onChange={(e) => handleUpdateStepParam(idx, 'rotation', parseFloat(e.target.value))}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                                >
                                  <option value={45}>Diagonal 45°</option>
                                  <option value={0}>Horizontal 0°</option>
                                  <option value={90}>Vertical 90°</option>
                                  <option value={-45}>Reverse -45°</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400">Opacity ({Math.round((step.params.opacity ?? 0.25) * 100)}%)</label>
                                <input
                                  type="number"
                                  min="0.05"
                                  max="1.0"
                                  step="0.05"
                                  value={step.params.opacity ?? 0.25}
                                  onChange={(e) => handleUpdateStepParam(idx, 'opacity', parseFloat(e.target.value))}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400">Color</label>
                                <input
                                  type="text"
                                  value={step.params.hex_color || step.params.color || '#ef4444'}
                                  onChange={(e) => handleUpdateStepParam(idx, 'hex_color', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono"
                                />
                              </div>
                            </div>

                            <label className="flex items-center gap-2 pt-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={bool(step.params.tiled)}
                                onChange={(e) => handleUpdateStepParam(idx, 'tiled', e.target.checked)}
                                className="accent-brand-500 rounded"
                              />
                              <span className="text-[11px] text-slate-300">Tile watermark repeatedly across entire page</span>
                            </label>
                          </div>
                        )}

                        {/* 3. BATES LEGAL NUMBERING STEP (FULL PARAMETER SET) */}
                        {step.type === 'bates' && (
                          <div className="space-y-2.5">
                            {/* Row 1: Prefix, Start Number, Zero Padding, Suffix */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400">Prefix</label>
                                <input
                                  type="text"
                                  value={step.params.prefix ?? 'DOC-'}
                                  onChange={(e) => handleUpdateStepParam(idx, 'prefix', e.target.value)}
                                  placeholder="e.g. CASE-"
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400">Start Number</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={step.params.start_number ?? 1}
                                  onChange={(e) => handleUpdateStepParam(idx, 'start_number', parseInt(e.target.value) || 1)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400">Zero Padding</label>
                                <select
                                  value={step.params.padding_digits ?? step.params.zero_pad ?? 6}
                                  onChange={(e) => handleUpdateStepParam(idx, 'padding_digits', parseInt(e.target.value))}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                                >
                                  <option value={3}>3 digits (001)</option>
                                  <option value={4}>4 digits (0001)</option>
                                  <option value={5}>5 digits (00001)</option>
                                  <option value={6}>6 digits (000001)</option>
                                  <option value={7}>7 digits (0000001)</option>
                                  <option value={8}>8 digits (00000001)</option>
                                  <option value={9}>9 digits (000000001)</option>
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400">Suffix</label>
                                <input
                                  type="text"
                                  value={step.params.suffix ?? ''}
                                  onChange={(e) => handleUpdateStepParam(idx, 'suffix', e.target.value)}
                                  placeholder="e.g. -CONF"
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono"
                                />
                              </div>
                            </div>

                            {/* Row 2: Placement Zone, Font Size, Target Pages */}
                            <div className="grid grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400">Placement Zone</label>
                                <select
                                  value={step.params.bates_position ?? step.params.position ?? 'bottom-right'}
                                  onChange={(e) => handleUpdateStepParam(idx, 'bates_position', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                                >
                                  <option value="bottom-right">Bottom Right (Standard)</option>
                                  <option value="bottom-center">Bottom Center</option>
                                  <option value="bottom-left">Bottom Left</option>
                                  <option value="top-right">Top Right</option>
                                  <option value="top-center">Top Center</option>
                                  <option value="top-left">Top Left</option>
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400">Font Size</label>
                                <select
                                  value={step.params.font_size ?? 10}
                                  onChange={(e) => handleUpdateStepParam(idx, 'font_size', parseInt(e.target.value))}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                                >
                                  <option value={8}>8 pt</option>
                                  <option value={9}>9 pt</option>
                                  <option value={10}>10 pt (Default)</option>
                                  <option value={11}>11 pt</option>
                                  <option value={12}>12 pt</option>
                                  <option value={14}>14 pt</option>
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400">Target Pages</label>
                                <select
                                  value={step.params.target_pages ?? 'all'}
                                  onChange={(e) => handleUpdateStepParam(idx, 'target_pages', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                                >
                                  <option value="all">All Pages</option>
                                  <option value="exclude_first">Exclude Cover Page</option>
                                  <option value="custom">Custom Range</option>
                                </select>
                              </div>
                            </div>

                            {/* Custom Range Input (if selected) */}
                            {step.params.target_pages === 'custom' && (
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400">Custom Page Intervals (e.g. 1, 3-5, 8)</label>
                                <input
                                  type="text"
                                  value={step.params.custom_range ?? ''}
                                  onChange={(e) => handleUpdateStepParam(idx, 'custom_range', e.target.value)}
                                  placeholder="1, 3-5, 8"
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono"
                                />
                              </div>
                            )}

                            {/* Anti-collision gutter guard toggle */}
                            <label className="flex items-center gap-2 pt-0.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={step.params.shrink_content !== false}
                                onChange={(e) => handleUpdateStepParam(idx, 'shrink_content', e.target.checked)}
                                className="accent-brand-500 rounded"
                              />
                              <span className="text-[11px] text-slate-300 font-medium">
                                Anti-Collision Margin Guard (shrinks page 5% inwards so text/signatures are never obscured)
                              </span>
                            </label>

                            {/* Optional Exhibit Stamp Controls */}
                            <div className="pt-2 border-t border-slate-800/60 grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400">Optional Exhibit / Header Stamp</label>
                                <input
                                  type="text"
                                  value={step.params.exhibit_text ?? ''}
                                  onChange={(e) => handleUpdateStepParam(idx, 'exhibit_text', e.target.value)}
                                  placeholder="e.g. CONFIDENTIAL or EXHIBIT A"
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400">Exhibit Position</label>
                                <select
                                  value={step.params.exhibit_position ?? 'top-right'}
                                  onChange={(e) => handleUpdateStepParam(idx, 'exhibit_position', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                                >
                                  <option value="top-right">Top Right</option>
                                  <option value="top-center">Top Center</option>
                                  <option value="top-left">Top Left</option>
                                  <option value="bottom-left">Bottom Left</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 4. SANITIZE STEP (FULL CHECKLIST SET) */}
                        {step.type === 'sanitize' && (
                          <div className="space-y-1.5 pt-1">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-300">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={step.params.strip_metadata !== false}
                                  onChange={(e) => handleUpdateStepParam(idx, 'strip_metadata', e.target.checked)}
                                  className="accent-brand-500 rounded"
                                />
                                <span>Purge DocInfo (/Info metadata)</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={step.params.strip_xmp !== false}
                                  onChange={(e) => handleUpdateStepParam(idx, 'strip_xmp', e.target.checked)}
                                  className="accent-brand-500 rounded"
                                />
                                <span>Purge XMP Metadata Packet</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={step.params.strip_javascript !== false}
                                  onChange={(e) => handleUpdateStepParam(idx, 'strip_javascript', e.target.checked)}
                                  className="accent-brand-500 rounded"
                                />
                                <span>Purge JavaScript &amp; Actions</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={step.params.strip_attachments !== false}
                                  onChange={(e) => handleUpdateStepParam(idx, 'strip_attachments', e.target.checked)}
                                  className="accent-brand-500 rounded"
                                />
                                <span>Purge Embedded File Attachments</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={step.params.strip_annotations !== false}
                                  onChange={(e) => handleUpdateStepParam(idx, 'strip_annotations', e.target.checked)}
                                  className="accent-brand-500 rounded"
                                />
                                <span>Purge Review Comments &amp; Notes</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={step.params.linearize !== false}
                                  onChange={(e) => handleUpdateStepParam(idx, 'linearize', e.target.checked)}
                                  className="accent-brand-500 rounded"
                                />
                                <span>Linearize &amp; Destroy Revision Streams</span>
                              </label>
                            </div>
                          </div>
                        )}

                        {/* 5. FLATTEN STEP */}
                        {step.type === 'flatten' && (
                          <div className="space-y-1 pt-1">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={step.params.lock_permissions !== false}
                                onChange={(e) => handleUpdateStepParam(idx, 'lock_permissions', e.target.checked)}
                                className="accent-brand-500 rounded"
                              />
                              <span className="text-[11px] text-slate-300 font-medium">
                                Lock permissions &amp; burn all interactive widgets into permanent page graphics
                              </span>
                            </label>
                          </div>
                        )}

                        {/* 6. PROTECT STEP */}
                        {step.type === 'protect' && (
                          <div className="space-y-2.5 pt-1">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {/* Open Password (User) */}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-semibold text-slate-300">
                                    Document Open Password
                                  </label>
                                  <span className="text-[9px] text-slate-500 font-mono">User Password</span>
                                </div>
                                <div className="relative">
                                  <input
                                    type={showUserPwd[idx] ? 'text' : 'password'}
                                    value={step.params.user_password || ''}
                                    onChange={(e) => handleUpdateStepParam(idx, 'user_password', e.target.value)}
                                    placeholder="Password required to view..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 pr-8 text-xs text-white placeholder:text-slate-600"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowUserPwd((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                  >
                                    {showUserPwd[idx] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                  Locks opening. Viewers must enter this password to view pages.
                                </p>
                              </div>

                              {/* Permissions Password (Owner) */}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-semibold text-slate-300">
                                    Permissions Password
                                  </label>
                                  <span className="text-[9px] text-slate-500 font-mono">Owner / Master</span>
                                </div>
                                <div className="relative">
                                  <input
                                    type={showOwnerPwd[idx] ? 'text' : 'password'}
                                    value={step.params.owner_password || ''}
                                    onChange={(e) => handleUpdateStepParam(idx, 'owner_password', e.target.value)}
                                    placeholder="Password required to edit/print..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 pr-8 text-xs text-white placeholder:text-slate-600"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowOwnerPwd((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                  >
                                    {showOwnerPwd[idx] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                  Locks editing. Restricts modifying, printing, or extracting content.
                                </p>
                              </div>
                            </div>

                            {/* Active Mode Explanation Banner */}
                            <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[11px] leading-relaxed">
                              {step.params.user_password && step.params.owner_password ? (
                                <div className="text-emerald-400 flex items-start gap-1.5">
                                  <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                  <span>
                                    <strong>Dual-Layer Protection Active:</strong> Recipients use Open Password to view; Master Permissions Password required to edit or remove restrictions.
                                  </span>
                                </div>
                              ) : step.params.user_password ? (
                                <div className="text-blue-400 flex items-start gap-1.5">
                                  <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                  <span>
                                    <strong>Viewing Locked:</strong> Document cannot be opened or read by anyone without entering the Open Password.
                                  </span>
                                </div>
                              ) : step.params.owner_password ? (
                                <div className="text-indigo-400 flex items-start gap-1.5">
                                  <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                  <span>
                                    <strong>Permissions Restricted:</strong> PDF can be opened and read freely without a password, but printing, copying text, and modifying content are locked.
                                  </span>
                                </div>
                              ) : (
                                <div className="text-amber-400/90 flex items-start gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                  <span>
                                    Please enter at least one password: set <strong>Open Password</strong> to lock viewing, or <strong>Permissions Password</strong> to lock editing.
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Execution Queue & Result Feedback */}
        <div className="lg:col-span-5 space-y-4">
          {/* Queue Card */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-brand-400" />
                Batch Target Queue ({pdfFiles.length})
              </h3>
            </div>

            {pdfFiles.length === 0 ? (
              <div className="py-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                Drop PDF files in the dropzone above to apply this pipeline.
              </div>
            ) : (
              <div className="max-h-[180px] overflow-y-auto space-y-1.5 pr-1">
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
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Output Prefix:</span>
              <input
                type="text"
                value={outputPrefix}
                onChange={(e) => setOutputPrefix(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* Action Trigger Button */}
          <button
            onClick={handleRunPipeline}
            disabled={isProcessing || pdfFiles.length === 0 || steps.length === 0}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-brand-500/25 transition active:scale-[0.99] disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Executing Pipeline on {pdfFiles.length} Document{pdfFiles.length > 1 ? 's' : ''}...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                Execute Pipeline ({pdfFiles.length} Files, {steps.length} Steps)
              </>
            )}
          </button>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Results Card */}
          {pipelineResult && (
            <div
              className={`p-4 rounded-2xl border space-y-4 shadow-xl ${
                pipelineResult.successful_documents === 0
                  ? 'bg-red-950/40 border-red-800/60'
                  : pipelineResult.successful_documents < pipelineResult.total_documents
                  ? 'bg-amber-950/40 border-amber-800/60'
                  : 'bg-emerald-950/40 border-emerald-800/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`flex items-center gap-2 font-bold text-xs ${
                    pipelineResult.successful_documents === 0
                      ? 'text-red-400'
                      : pipelineResult.successful_documents < pipelineResult.total_documents
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {pipelineResult.successful_documents === 0 ? (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      Pipeline Execution Failed
                    </>
                  ) : pipelineResult.successful_documents < pipelineResult.total_documents ? (
                    <>
                      <AlertTriangle className="w-4 h-4" />
                      Completed with Warnings
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Pipeline Complete!
                    </>
                  )}
                </div>
                <span
                  className={`text-[11px] font-mono ${
                    pipelineResult.successful_documents === 0
                      ? 'text-red-400/80'
                      : pipelineResult.successful_documents < pipelineResult.total_documents
                      ? 'text-amber-400/80'
                      : 'text-emerald-400/80'
                  }`}
                >
                  {pipelineResult.successful_documents} / {pipelineResult.total_documents} succeeded
                </span>
              </div>

              {/* Download ZIP bundle button */}
              {pipelineResult.zip_url && pipelineResult.successful_documents > 0 && (
                <button
                  onClick={() => triggerDownload(pipelineResult.zip_url!)}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-[0.99]"
                >
                  <Archive className="w-4 h-4" />
                  Download All Processed Files (.zip)
                </button>
              )}

              {/* Per-File Breakdown with accurate Success vs Error states */}
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {pipelineResult.results.map((res, i) => (
                  <div
                    key={i}
                    className={`p-2.5 rounded-lg border text-xs space-y-1.5 ${
                      res.status === 'error'
                        ? 'bg-red-900/20 border-red-800/50 text-red-200'
                        : 'bg-emerald-900/20 border-emerald-800/40 text-emerald-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold truncate max-w-[200px]" title={res.filename}>
                        {res.filename}
                      </span>
                      {res.status === 'error' ? (
                        <span className="text-red-400 text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-red-950/60 border border-red-800/40">
                          Failed
                        </span>
                      ) : res.download_url ? (
                        <button
                          onClick={() => triggerDownload(res.download_url!)}
                          className="text-emerald-400 hover:text-emerald-300 font-medium text-[11px] flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> Save
                        </button>
                      ) : null}
                    </div>

                    {res.status === 'error' ? (
                      <p className="text-[11px] text-red-300 leading-tight">
                        {res.error || 'Pipeline execution step failed.'}
                      </p>
                    ) : (
                      <div className="flex items-center justify-between text-[10px] text-emerald-400/70 font-mono">
                        <span>{res.steps_executed} steps applied</span>
                        {res.original_size && res.final_size && (
                          <span>
                            {formatSize(res.original_size)} &rarr; {formatSize(res.final_size)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper for boolean conversion in inputs
function bool(val: any): boolean {
  return Boolean(val);
}
