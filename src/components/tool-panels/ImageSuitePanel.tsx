import React, { useState } from 'react';
import { useAppStore, showToast } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import { Image as ImageIcon, FileOutput, Sliders, Download, CheckCircle, AlertCircle } from 'lucide-react';

export const ImageSuitePanel: React.FC = () => {
  const { files, selectedFile, currentJob } = useAppStore();
  const { callApi, triggerDownload } = useSidecar();

  const [mode, setMode] = useState<'pdf_to_images' | 'images_to_pdf' | 'bulk_process'>('pdf_to_images');

  // PDF to Images
  const [format, setFormat] = useState('PNG');
  const [dpi, setDpi] = useState(200);

  // Bulk image processing
  const [targetFormat, setTargetFormat] = useState('WEBP');
  const [quality, setQuality] = useState(85);
  const [resizeMode, setResizeMode] = useState<'none' | 'percentage' | 'dimensions'>('none');
  const [percentage, setPercentage] = useState(50);
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [stripExif, setStripExif] = useState(true);

  const handleAction = async () => {
    if (mode === 'pdf_to_images') {
      if (!selectedFile) {
        showToast('Please upload and select a PDF file.', 'warning');
        return;
      }
      await callApi('/api/images/pdf-to-images', {
        file_path: selectedFile.path,
        image_format: format,
        dpi: Number(dpi),
      });
    } else if (mode === 'images_to_pdf') {
      if (files.length === 0) {
        showToast('Please upload at least one image file.', 'warning');
        return;
      }
      const imagePaths = files.map((f) => f.path);
      await callApi('/api/images/images-to-pdf', {
        image_paths: imagePaths,
        output_filename: 'compiled_images.pdf',
      });
    } else if (mode === 'bulk_process') {
      if (files.length === 0) {
        showToast('Please upload image files to process.', 'warning');
        return;
      }
      const imagePaths = files.map((f) => f.path);
      await callApi('/api/images/bulk-process', {
        file_paths: imagePaths,
        target_format: targetFormat,
        quality: Number(quality),
        resize_mode: resizeMode === 'none' ? undefined : resizeMode,
        percentage: resizeMode === 'percentage' ? Number(percentage) : undefined,
        width: resizeMode === 'dimensions' ? Number(width) : undefined,
        height: resizeMode === 'dimensions' ? Number(height) : undefined,
        strip_exif: stripExif,
      });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-brand-400" />
          Image Processing Suite (iLoveIMG Offline)
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          High-resolution PDF rasterization, image-to-PDF compilation, bulk WebP/JPEG conversion, and EXIF sanitization.
        </p>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setMode('pdf_to_images')}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            mode === 'pdf_to_images'
              ? 'border-brand-500 bg-brand-500/10 text-white'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileOutput className="w-3.5 h-3.5" /> PDF to Images
        </button>

        <button
          onClick={() => setMode('images_to_pdf')}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            mode === 'images_to_pdf'
              ? 'border-brand-500 bg-brand-500/10 text-white'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" /> Images to PDF
        </button>

        <button
          onClick={() => setMode('bulk_process')}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            mode === 'bulk_process'
              ? 'border-brand-500 bg-brand-500/10 text-white'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" /> Bulk Image Tools
        </button>
      </div>

      {mode === 'pdf_to_images' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300">Target Image Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value="PNG">PNG (Lossless)</option>
                <option value="JPEG">JPEG (Compressed)</option>
                <option value="WEBP">WebP (Modern Compact)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300">Rendering Resolution (DPI)</label>
              <select
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
                className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value={150}>150 DPI (Standard Screen)</option>
                <option value={200}>200 DPI (High Quality)</option>
                <option value={300}>300 DPI (Ultra Crisp / Print)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {mode === 'images_to_pdf' && (
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 text-xs text-slate-300">
          <p className="font-semibold text-slate-200 mb-1">Combine {files.length} Images into One PDF</p>
          <p className="text-slate-400">
            Upload images in the box above. They will be ordered and combined with automatic orientation detection and lossless encoding.
          </p>
        </div>
      )}

      {mode === 'bulk_process' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300">Convert Format</label>
              <select
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value)}
                className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value="WEBP">WebP (Fast & Compact)</option>
                <option value="JPEG">JPEG (Standard)</option>
                <option value="PNG">PNG (Lossless)</option>
                <option value="TIFF">TIFF (Archival)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300">Quality ({quality}%)</label>
              <input
                type="range"
                min={20}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full mt-2 accent-brand-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300">Resize Mode</label>
              <select
                value={resizeMode}
                onChange={(e) => setResizeMode(e.target.value as any)}
                className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value="none">Original Dimensions</option>
                <option value="percentage">By Percentage</option>
                <option value="dimensions">Exact Dimensions (px)</option>
              </select>
            </div>
          </div>

          {resizeMode === 'percentage' && (
            <div>
              <label className="text-xs font-medium text-slate-300">Scale ({percentage}%)</label>
              <input
                type="range"
                min={10}
                max={150}
                value={percentage}
                onChange={(e) => setPercentage(Number(e.target.value))}
                className="w-full mt-2 accent-brand-500"
              />
            </div>
          )}

          {resizeMode === 'dimensions' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300">Width (px)</label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Height (px)</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200"
                />
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="exif_cb"
              checked={stripExif}
              onChange={(e) => setStripExif(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-brand-600 focus:ring-0"
            />
            <label htmlFor="exif_cb" className="text-xs text-slate-300 cursor-pointer">
              Strip EXIF metadata (GPS location, camera tags, device info) for privacy
            </label>
          </div>
        </div>
      )}

      <button
        onClick={handleAction}
        disabled={currentJob.status === 'running'}
        className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
      >
        <ImageIcon className="w-4 h-4" />
        {currentJob.status === 'running'
          ? 'Processing Images...'
          : mode === 'pdf_to_images'
          ? 'Convert PDF Pages to Images'
          : mode === 'images_to_pdf'
          ? `Compile ${files.length} Images to PDF`
          : 'Apply Bulk Image Processing'}
      </button>

      {/* Result feedback */}
      {currentJob.status === 'success' && currentJob.downloadUrl && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-emerald-400 text-xs">
            <CheckCircle className="w-4 h-4" />
            <span className="font-medium">
              {mode === 'bulk_process' ? 'Bulk image processing complete! Archive ready.' : currentJob.message}
            </span>
          </div>
          <button
            onClick={() => triggerDownload(currentJob.downloadUrl!)}
            className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download Result {mode === 'bulk_process' && files.length > 1 ? '(ZIP)' : ''}
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
