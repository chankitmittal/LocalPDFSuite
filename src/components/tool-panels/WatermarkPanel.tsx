import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useAppStore } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import { Stamp, Hash, Download, CheckCircle, AlertCircle, Eye, Sparkles } from 'lucide-react';

export const WatermarkPanel: React.FC = () => {
  const { selectedFile, pages, currentJob } = useAppStore();
  const { callApi, triggerDownload } = useSidecar();

  const [tab, setTab] = useState<'watermark' | 'page_numbers'>('watermark');

  // Watermark parameters
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.25);
  const [rotation, setRotation] = useState(45);
  const [hexColor, setHexColor] = useState('#ef4444');
  const [tiled, setTiled] = useState(false);

  // Page numbers parameters
  const [formatStr, setFormatStr] = useState('Page {n} of {total}');
  const [position, setPosition] = useState('bottom-center');
  const [pnFontSize, setPnFontSize] = useState(11);

  // Preview canvas & base PDF page image
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [basePageImage, setBasePageImage] = useState<HTMLImageElement | null>(null);
  const [pageAspectRatio, setPageAspectRatio] = useState(1.414); // default A4/Letter
  const [renderingPage, setRenderingPage] = useState(false);

  // 1. Render base PDF page to an Image once file is selected
  useEffect(() => {
    if (!selectedFile || !selectedFile.fileObj || !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setBasePageImage(null);
      return;
    }

    let isCancelled = false;
    setRenderingPage(true);

    const renderFirstPage = async () => {
      try {
        const buffer = await selectedFile.fileObj!.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.0 });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;

        await page.render({ canvasContext: ctx, viewport }).promise;

        if (isCancelled) return;

        const img = new Image();
        img.src = canvas.toDataURL('image/png');
        img.onload = () => {
          if (!isCancelled) {
            setBasePageImage(img);
            setPageAspectRatio(viewport.height / viewport.width);
            setRenderingPage(false);
          }
        };
      } catch (err) {
        console.warn('Could not render page preview via pdfjs-dist:', err);
        if (!isCancelled) setRenderingPage(false);
      }
    };

    renderFirstPage();

    return () => {
      isCancelled = true;
    };
  }, [selectedFile]);

  // 2. Real-time Live Preview Drawing
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasWidth = 360;
    const canvasHeight = Math.round(canvasWidth * pageAspectRatio);
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw document base (either rendered PDF page or mock paper sheet)
    if (basePageImage) {
      ctx.drawImage(basePageImage, 0, 0, canvasWidth, canvasHeight);
    } else {
      // Clean paper background with faux text lines
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(25, 30, canvasWidth - 50, 20); // Title bar
      for (let y = 70; y < canvasHeight - 50; y += 18) {
        ctx.fillRect(25, y, canvasWidth - 50, 10);
      }
    }

    // Scale factor between actual PDF points (approx 600-800pt) and preview canvas (360px)
    const scale = canvasWidth / 595.0;

    // Draw overlay on top
    if (tab === 'watermark') {
      ctx.save();
      ctx.fillStyle = hexColor;
      ctx.globalAlpha = opacity;
      const scaledFont = Math.max(12, Math.round(fontSize * scale));
      ctx.font = `bold ${scaledFont}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (tiled) {
        const stepX = Math.max(120, scaledFont * 4.5);
        const stepY = Math.max(90, scaledFont * 3);
        const rad = (rotation * Math.PI) / 180;

        for (let x = -canvasWidth; x < canvasWidth * 2; x += stepX) {
          for (let y = -canvasHeight; y < canvasHeight * 2; y += stepY) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rad);
            ctx.fillText(text, 0, 0);
            ctx.restore();
          }
        }
      } else {
        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.fillText(text, 0, 0);
      }

      ctx.restore();
    } else if (tab === 'page_numbers') {
      ctx.save();
      ctx.fillStyle = '#1e293b';
      const scaledFont = Math.max(9, Math.round(pnFontSize * scale * 1.5));
      ctx.font = `${scaledFont}px sans-serif`;
      const numText = formatStr.replace('{n}', '1').replace('{total}', String(pages.length || 1));

      const marginX = 20;
      const marginY = 20;

      if (position === 'bottom-center') {
        ctx.textAlign = 'center';
        ctx.fillText(numText, canvasWidth / 2, canvasHeight - marginY);
      } else if (position === 'bottom-right') {
        ctx.textAlign = 'right';
        ctx.fillText(numText, canvasWidth - marginX, canvasHeight - marginY);
      } else if (position === 'bottom-left') {
        ctx.textAlign = 'left';
        ctx.fillText(numText, marginX, canvasHeight - marginY);
      } else if (position === 'top-center') {
        ctx.textAlign = 'center';
        ctx.fillText(numText, canvasWidth / 2, marginY + 10);
      } else if (position === 'top-right') {
        ctx.textAlign = 'right';
        ctx.fillText(numText, canvasWidth - marginX, marginY + 10);
      } else if (position === 'top-left') {
        ctx.textAlign = 'left';
        ctx.fillText(numText, marginX, marginY + 10);
      }

      ctx.restore();
    }
  }, [
    text,
    fontSize,
    opacity,
    rotation,
    hexColor,
    tiled,
    tab,
    formatStr,
    position,
    pnFontSize,
    basePageImage,
    pageAspectRatio,
    pages.length,
  ]);

  const handleApplyWatermark = async () => {
    if (!selectedFile) {
      alert('Please upload and select a PDF document first.');
      return;
    }

    if (tab === 'watermark') {
      await callApi('/api/overlays/watermark', {
        file_path: selectedFile.path,
        text,
        font_size: Number(fontSize),
        opacity: Number(opacity),
        rotation: Number(rotation),
        hex_color: hexColor,
        tiled,
        output_filename: `watermarked_${selectedFile.name}`,
      });
    } else {
      await callApi('/api/overlays/page-numbers', {
        file_path: selectedFile.path,
        format_str: formatStr,
        position,
        font_size: Number(pnFontSize),
        output_filename: `numbered_${selectedFile.name}`,
      });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Stamp className="w-5 h-5 text-brand-400" />
          Watermark & Page Numbers
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Add transparent text watermarks or dynamic page numbering with live instant preview.
        </p>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setTab('watermark')}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            tab === 'watermark'
              ? 'border-brand-500 bg-brand-500/10 text-white'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Stamp className="w-3.5 h-3.5" /> Text Watermark
        </button>

        <button
          onClick={() => setTab('page_numbers')}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            tab === 'page_numbers'
              ? 'border-brand-500 bg-brand-500/10 text-white'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Hash className="w-3.5 h-3.5" /> Page Numbers
        </button>
      </div>

      {/* Split Grid: Controls on Left, Live Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Controls Column (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {tab === 'watermark' ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Watermark Text</label>
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="e.g. CONFIDENTIAL / DRAFT"
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <label className="font-medium">Font Size</label>
                    <span className="font-mono text-brand-400 font-bold">{fontSize} pt</span>
                  </div>
                  <input
                    type="range"
                    min={18}
                    max={120}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-full mt-2 accent-brand-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <label className="font-medium">Opacity</label>
                    <span className="font-mono text-brand-400 font-bold">{Math.round(opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.9}
                    step={0.05}
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-full mt-2 accent-brand-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <label className="font-medium">Rotation Angle</label>
                    <span className="font-mono text-brand-400 font-bold">{rotation}°</span>
                  </div>
                  <input
                    type="range"
                    min={-90}
                    max={90}
                    step={5}
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="w-full mt-2 accent-brand-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Color</label>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="color"
                      value={hexColor}
                      onChange={(e) => setHexColor(e.target.value)}
                      className="w-9 h-9 rounded-xl bg-transparent cursor-pointer border border-slate-700 p-0.5"
                    />
                    <input
                      type="text"
                      value={hexColor}
                      onChange={(e) => setHexColor(e.target.value)}
                      className="w-24 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono text-slate-200"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2.5 p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                <input
                  type="checkbox"
                  id="tiled_cb"
                  checked={tiled}
                  onChange={(e) => setTiled(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-brand-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="tiled_cb" className="text-xs text-slate-300 cursor-pointer select-none">
                  Tile watermark repeatedly across whole document page
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Format String</label>
                <input
                  type="text"
                  value={formatStr}
                  onChange={(e) => setFormatStr(e.target.value)}
                  placeholder="Page {n} of {total}"
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Use {'{n}'} for current page number and {'{total}'} for total page count.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-300">Position</label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="bottom-center">Bottom Center</option>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="top-center">Top Center</option>
                    <option value="top-right">Top Right</option>
                    <option value="top-left">Top Left</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <label className="font-medium">Font Size</label>
                    <span className="font-mono text-brand-400 font-bold">{pnFontSize} pt</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={24}
                    value={pnFontSize}
                    onChange={(e) => setPnFontSize(Number(e.target.value))}
                    className="w-full mt-2 accent-brand-500"
                  />
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleApplyWatermark}
            disabled={!selectedFile || currentJob.status === 'running'}
            className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
          >
            <Stamp className="w-4 h-4" />
            {currentJob.status === 'running'
              ? 'Applying Overlays...'
              : tab === 'watermark'
              ? 'Apply Text Watermark'
              : 'Apply Page Numbers'}
          </button>
        </div>

        {/* Live Preview Column (5 cols) */}
        <div className="lg:col-span-5 bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col items-center space-y-3">
          <div className="w-full flex items-center justify-between border-b border-slate-800/80 pb-2.5 px-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <Eye className="w-3.5 h-3.5 text-brand-400" />
              <span>Live Page Preview</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 font-medium">
              <Sparkles className="w-2.5 h-2.5" /> Instant Updates
            </span>
          </div>

          {/* Canvas Sheet Frame */}
          <div className="w-full flex justify-center py-2">
            <div className="relative shadow-2xl rounded-lg overflow-hidden border border-slate-700/80 bg-white">
              <canvas
                ref={previewCanvasRef}
                className="max-w-full h-auto block"
                style={{ width: '280px' }}
              />

              {renderingPage && (
                <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center text-xs text-brand-400">
                  <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin mr-2" />
                  Rendering PDF page...
                </div>
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-400 text-center px-2">
            Preview updates in real-time as you adjust text, size, opacity, rotation angle, or color.
          </div>
        </div>
      </div>

      {/* Result feedback */}
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
            <Download className="w-3.5 h-3.5" /> Save File
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
