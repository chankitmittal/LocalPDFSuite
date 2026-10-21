import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useAppStore, showToast } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import {
  PenTool,
  Upload,
  Image as ImageIcon,
  Eraser,
  ShieldCheck,
  Key,
  Download,
  CheckCircle,
  AlertCircle,
  Move,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  FileSignature,
  Sliders,
  Check,
} from 'lucide-react';

export const SignPanel: React.FC = () => {
  const { selectedFile, currentJob } = useAppStore();
  const { callApi, uploadFile, triggerDownload } = useSidecar();

  // Top tabs
  const [signType, setSignType] = useState<'visual' | 'crypto' | 'generate_cert'>('visual');

  // Visual sign source: 'draw' | 'import'
  const [sigSource, setSigSource] = useState<'draw' | 'import'>('draw');

  // Drawing canvas state
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#2563eb');
  const [penWidth, setPenWidth] = useState(3);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Active signature image data (base64 Data URL)
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // Imported image state
  const [importedRawUrl, setImportedRawUrl] = useState<string | null>(null);
  const [removeBg, setRemoveBg] = useState(true);

  // PDF Page Viewer & Placement state
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [renderingPage, setRenderingPage] = useState(false);
  const [pagePtSize, setPagePtSize] = useState<{ width: number; height: number }>({ width: 595, height: 842 });
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 480, height: 680 });

  // Stamp placement state (in canvas screen pixels)
  const [stampPixelPos, setStampPixelPos] = useState<{ x: number; y: number }>({ x: 280, y: 550 });
  const [stampPixelSize, setStampPixelSize] = useState<{ width: number; height: number }>({ width: 140, height: 50 });
  const [isDraggingStamp, setIsDraggingStamp] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Crypto sign params
  const [isCryptoVisible, setIsCryptoVisible] = useState(true);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [serverCertPath, setServerCertPath] = useState<string | null>(null);
  const [certPassphrase, setCertPassphrase] = useState('');
  const [signReason, setSignReason] = useState('Digitally verified and approved');
  const [signLocation, setSignLocation] = useState('Local Desktop');

  // Cert generation
  const [newCertPass, setNewCertPass] = useState('Password123');
  const [newCertName, setNewCertName] = useState('My Local Identity');
  const [newCertOrg, setNewCertOrg] = useState('LocalPDF Workstation');
  const [newCertDays, setNewCertDays] = useState(365);
  const [generatedCert, setGeneratedCert] = useState<{ path: string; name: string; pass: string } | null>(null);

  // ==================== 1. DRAWING CANVAS (Zero Offset) ====================
  const getCanvasPos = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineWidth = penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = penColor;

    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getCanvasPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = drawCanvasRef.current;
    if (canvas && hasDrawn) {
      setSignatureDataUrl(canvas.toDataURL('image/png'));
    }
  };

  const clearCanvas = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setSignatureDataUrl(null);
  };

  // ==================== 2. IMPORT SIGNATURE IMAGE ====================
  const handleImportImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImportedRawUrl(result);
      processImportedImage(result, removeBg);
    };
    reader.readAsDataURL(file);
  };

  const processImportedImage = (rawUrl: string, autoRemoveBg: boolean) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = img.naturalWidth || img.width;
      offscreen.height = img.naturalHeight || img.height;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);

      if (autoRemoveBg) {
        const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          // Detect white or light paper background
          if (r > 190 && g > 190 && b > 190) {
            const brightness = (r + g + b) / 3;
            if (brightness > 225) {
              d[i + 3] = 0; // Transparent
            } else {
              d[i + 3] = Math.round((255 - brightness) * 3);
            }
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }

      const processed = offscreen.toDataURL('image/png');
      setSignatureDataUrl(processed);
    };
    img.src = rawUrl;
  };

  const toggleBackgroundRemoval = () => {
    const nextVal = !removeBg;
    setRemoveBg(nextVal);
    if (importedRawUrl) {
      processImportedImage(importedRawUrl, nextVal);
    }
  };

  // ==================== 3. PDF PAGE RENDERING (PDF.js) ====================
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

        // Responsive target display width: up to 500px
        const targetWidth = Math.min(480, window.innerWidth - 80);
        const scale = targetWidth / originalViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = previewCanvasRef.current;
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
        console.warn('Failed to render PDF page for signature preview:', err);
        if (!isCancelled) setRenderingPage(false);
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [selectedFile, currentPage]);

  // ==================== 4. INTERACTIVE STAMP DRAGGING & PLACEMENT ====================
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If clicked directly on the page container (not on the stamp itself), reposition stamp center there
    if ((e.target as HTMLElement).closest('.signature-stamp-box')) {
      return;
    }
    const container = previewContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const newX = Math.max(0, Math.min(clickX - stampPixelSize.width / 2, canvasDimensions.width - stampPixelSize.width));
    const newY = Math.max(0, Math.min(clickY - stampPixelSize.height / 2, canvasDimensions.height - stampPixelSize.height));
    setStampPixelPos({ x: Math.round(newX), y: Math.round(newY) });
  };

  const handleStampMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsDraggingStamp(true);
    setDragOffset({
      x: e.clientX - stampPixelPos.x,
      y: e.clientY - stampPixelPos.y,
    });
  };

  const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingStamp) return;
    const container = previewContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newX = Math.max(0, Math.min(mouseX - (dragOffset.x - rect.left), canvasDimensions.width - stampPixelSize.width));
    const newY = Math.max(0, Math.min(mouseY - (dragOffset.y - rect.top), canvasDimensions.height - stampPixelSize.height));

    setStampPixelPos({ x: Math.round(newX), y: Math.round(newY) });
  };

  const handleContainerMouseUp = () => {
    if (isDraggingStamp) {
      setIsDraggingStamp(false);
    }
  };

  // Quick preset positions
  const applyPresetPosition = (preset: 'bottom-right' | 'bottom-left' | 'bottom-center' | 'center') => {
    const margin = 25;
    let x = 0;
    let y = 0;

    switch (preset) {
      case 'bottom-right':
        x = canvasDimensions.width - stampPixelSize.width - margin;
        y = canvasDimensions.height - stampPixelSize.height - margin;
        break;
      case 'bottom-left':
        x = margin;
        y = canvasDimensions.height - stampPixelSize.height - margin;
        break;
      case 'bottom-center':
        x = (canvasDimensions.width - stampPixelSize.width) / 2;
        y = canvasDimensions.height - stampPixelSize.height - margin;
        break;
      case 'center':
        x = (canvasDimensions.width - stampPixelSize.width) / 2;
        y = (canvasDimensions.height - stampPixelSize.height) / 2;
        break;
    }
    setStampPixelPos({ x: Math.round(x), y: Math.round(y) });
  };

  // Calculate PDF standard coordinates (72 DPI points, bottom-left origin)
  const scaleX = canvasDimensions.width > 0 ? pagePtSize.width / canvasDimensions.width : 1;
  const scaleY = canvasDimensions.height > 0 ? pagePtSize.height / canvasDimensions.height : 1;

  const pdfX = Math.round(stampPixelPos.x * scaleX * 10) / 10;
  const pdfY = Math.round((canvasDimensions.height - (stampPixelPos.y + stampPixelSize.height)) * scaleY * 10) / 10;
  const pdfWidth = Math.round(stampPixelSize.width * scaleX * 10) / 10;
  const pdfHeight = Math.round(stampPixelSize.height * scaleY * 10) / 10;

  // ==================== 5. SUBMIT VISUAL SIGN ====================
  const handleVisualSign = async () => {
    if (!selectedFile) {
      showToast('Please upload and select a PDF document first.', 'warning');
      return;
    }

    if (!signatureDataUrl) {
      showToast('Please draw or import a signature first.', 'warning');
      return;
    }

    try {
      // Convert Data URL to Blob
      const fetchRes = await fetch(signatureDataUrl);
      const blob = await fetchRes.blob();
      const sigFile = new File([blob], 'signature_stamp.png', { type: 'image/png' });
      const uploaded = await uploadFile(sigFile);

      await callApi('/api/sign/visual', {
        file_path: selectedFile.path,
        signature_image_path: uploaded.path,
        page_number: Number(currentPage),
        x: Number(pdfX),
        y: Number(pdfY),
        width: Number(pdfWidth),
        height: Number(pdfHeight),
        output_filename: `signed_visual_${selectedFile.name}`,
      });
    } catch (err: any) {
      console.error('Visual signing failed:', err);
    }
  };

  // ==================== 6. CRYPTOGRAPHIC SIGN & CERT GENERATION ====================
  const handleCryptoSign = async () => {
    if (!selectedFile) {
      showToast('Please upload and select a PDF document first.', 'warning');
      return;
    }

    let pfxPathToUse = serverCertPath;

    if (!pfxPathToUse) {
      if (!certFile) {
        showToast('Please select your .pfx or .p12 digital certificate file, or generate one in the "Create Certificate" tab.', 'warning');
        return;
      }
      const uploadedCert = await uploadFile(certFile);
      pfxPathToUse = uploadedCert.path;
    }

    await callApi('/api/sign/crypto', {
      file_path: selectedFile.path,
      pfx_path: pfxPathToUse,
      passphrase: certPassphrase,
      reason: signReason,
      location: signLocation,
      visible: isCryptoVisible,
      page_number: Number(currentPage),
      x: Number(pdfX),
      y: Number(pdfY),
      width: Number(pdfWidth),
      height: Number(pdfHeight),
      output_filename: `signed_crypto_${selectedFile.name}`,
    });
  };

  const handleGenerateCert = async () => {
    const filename = `${newCertName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pfx`;
    const res = await callApi('/api/sign/generate-cert', {
      passphrase: newCertPass,
      common_name: newCertName,
      organization: newCertOrg,
      days_valid: Number(newCertDays),
      output_filename: filename,
    });

    if (res && (res.output_path || res.output_pfx_path)) {
      const generatedPath = res.output_path || res.output_pfx_path;
      setGeneratedCert({
        path: generatedPath,
        name: filename,
        pass: newCertPass,
      });
    }
  };

  const handleUseGeneratedCert = () => {
    if (!generatedCert) return;
    setServerCertPath(generatedCert.path);
    setCertPassphrase(generatedCert.pass);
    setSignType('crypto');
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <FileSignature className="w-5 h-5 text-brand-400" />
          Digital Signatures (Visual Stamp & Cryptographic PAdES)
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Draw or import your signature, place it visually on any page of the PDF with live preview, or cryptographically sign using PKCS#12 certificates.
        </p>
      </div>

      {/* Main Tabs */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setSignType('visual')}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            signType === 'visual'
              ? 'border-brand-500 bg-brand-500/10 text-white shadow-sm'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <PenTool className="w-3.5 h-3.5" /> Visual Stamp & Placement
        </button>

        <button
          onClick={() => setSignType('crypto')}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            signType === 'crypto'
              ? 'border-brand-500 bg-brand-500/10 text-white shadow-sm'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" /> PAdES Crypto Sign
        </button>

        <button
          onClick={() => setSignType('generate_cert')}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            signType === 'generate_cert'
              ? 'border-brand-500 bg-brand-500/10 text-white shadow-sm'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Key className="w-3.5 h-3.5" /> Create Certificate (.pfx)
        </button>
      </div>

      {/* ==================== TAB 1: VISUAL SIGN & PLACEMENT ==================== */}
      {signType === 'visual' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Signature Source (Draw vs Import) & Controls */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <FileSignature className="w-4 h-4 text-brand-400" /> Signature Source
                </span>
                <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                  <button
                    onClick={() => setSigSource('draw')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md flex items-center gap-1 transition-colors ${
                      sigSource === 'draw'
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <PenTool className="w-3 h-3" /> Draw
                  </button>
                  <button
                    onClick={() => setSigSource('import')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md flex items-center gap-1 transition-colors ${
                      sigSource === 'import'
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Upload className="w-3 h-3" /> Import
                  </button>
                </div>
              </div>

              {/* Mode A: Draw Canvas */}
              {sigSource === 'draw' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="text-[11px]">Draw with mouse or stylus:</span>
                    <button
                      onClick={clearCanvas}
                      className="text-slate-400 hover:text-red-400 flex items-center gap-1 transition-colors text-[11px]"
                    >
                      <Eraser className="w-3 h-3" /> Clear Canvas
                    </button>
                  </div>

                  <div className="relative">
                    <canvas
                      ref={drawCanvasRef}
                      width={600}
                      height={180}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      className="w-full h-36 bg-slate-950 border border-slate-700 rounded-xl cursor-crosshair shadow-inner touch-none"
                    />
                    {!hasDrawn && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-600 text-xs italic">
                        Sign here with mouse or stylus
                      </div>
                    )}
                  </div>

                  {/* Pen Options */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 mr-1">Ink:</span>
                      {[
                        { color: '#2563eb', label: 'Blue' },
                        { color: '#0f172a', label: 'Black' },
                        { color: '#1e3a8a', label: 'Navy' },
                      ].map((c) => (
                        <button
                          key={c.color}
                          onClick={() => setPenColor(c.color)}
                          style={{ backgroundColor: c.color }}
                          className={`w-5 h-5 rounded-full border transition-all ${
                            penColor === c.color ? 'ring-2 ring-brand-400 scale-110 border-white' : 'border-slate-600'
                          }`}
                          title={c.label}
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="text-[10px]">Weight:</span>
                      {[2, 3, 4.5].map((w) => (
                        <button
                          key={w}
                          onClick={() => setPenWidth(w)}
                          className={`px-2 py-0.5 text-[10px] rounded border ${
                            penWidth === w
                              ? 'bg-brand-600/30 border-brand-500 text-brand-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          {w === 2 ? 'Fine' : w === 3 ? 'Medium' : 'Bold'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Mode B: Import Image */}
              {sigSource === 'import' && (
                <div className="space-y-3">
                  <div className="border-2 border-dashed border-slate-700 hover:border-brand-500/60 rounded-xl p-4 text-center transition-colors bg-slate-950/40">
                    <input
                      type="file"
                      id="signature-image-upload"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={handleImportImage}
                      className="hidden"
                    />
                    <label
                      htmlFor="signature-image-upload"
                      className="cursor-pointer flex flex-col items-center justify-center space-y-1.5"
                    >
                      <ImageIcon className="w-8 h-8 text-brand-400 mb-0.5" />
                      <span className="text-xs font-medium text-slate-200">
                        Click to select signature image
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Supports PNG, JPG, JPEG, SVG or WebP scans
                      </span>
                    </label>
                  </div>

                  {importedRawUrl && (
                    <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-300">Imported Signature Preview</span>
                        <button
                          onClick={toggleBackgroundRemoval}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                            removeBg
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-slate-700 border-slate-600 text-slate-300'
                          }`}
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          {removeBg ? 'Auto-Transparent Ink: ON' : 'Original Background: ON'}
                        </button>
                      </div>

                      <div className="h-16 flex items-center justify-center bg-slate-950/60 rounded-lg border border-slate-800 p-2">
                        {signatureDataUrl ? (
                          <img
                            src={signatureDataUrl}
                            alt="Signature Preview"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-xs text-slate-500">Processing image...</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Stamp Size Controls */}
              <div className="p-3.5 bg-slate-800/30 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-brand-400" /> Stamp Size & Dimensions
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {pdfWidth} × {pdfHeight} pt
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Width</span>
                      <span>{stampPixelSize.width}px</span>
                    </div>
                    <input
                      type="range"
                      min={70}
                      max={260}
                      step={5}
                      value={stampPixelSize.width}
                      onChange={(e) =>
                        setStampPixelSize((prev) => ({
                          ...prev,
                          width: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-brand-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Height</span>
                      <span>{stampPixelSize.height}px</span>
                    </div>
                    <input
                      type="range"
                      min={25}
                      max={120}
                      step={5}
                      value={stampPixelSize.height}
                      onChange={(e) =>
                        setStampPixelSize((prev) => ({
                          ...prev,
                          height: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-brand-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Placement Presets */}
                <div className="pt-1">
                  <span className="text-[10px] text-slate-400 block mb-1.5">Quick Snap Presets:</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'bottom-right', label: 'Bottom-Right' },
                      { id: 'bottom-left', label: 'Bottom-Left' },
                      { id: 'bottom-center', label: 'Bottom-Mid' },
                      { id: 'center', label: 'Center' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => applyPresetPosition(p.id as any)}
                        className="py-1 px-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-slate-300 text-center transition-colors truncate"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleVisualSign}
                disabled={!selectedFile || !signatureDataUrl || currentJob.status === 'running'}
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
              >
                <FileSignature className="w-4 h-4" />
                {currentJob.status === 'running' ? 'Stamping Signature on PDF...' : 'Stamp Signature on PDF'}
              </button>
            </div>

            {/* Right Column: Interactive Document Canvas Placement & Preview */}
            <div className="lg:col-span-7 flex flex-col items-center justify-start space-y-3">
              {/* Page Navigator */}
              <div className="w-full flex items-center justify-between bg-slate-800/60 border border-slate-800 px-3.5 py-2 rounded-xl text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <Move className="w-4 h-4 text-brand-400" />
                  <span className="font-medium">
                    Drag the signature stamp anywhere on the page:
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

              {/* Document Canvas Container with Interactive Stamp Overlay */}
              <div
                ref={previewContainerRef}
                onClick={handleContainerClick}
                onMouseMove={handleContainerMouseMove}
                onMouseUp={handleContainerMouseUp}
                className="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl select-none cursor-pointer"
                style={{
                  width: canvasDimensions.width > 0 ? `${canvasDimensions.width}px` : '100%',
                  height: canvasDimensions.height > 0 ? `${canvasDimensions.height}px` : '600px',
                }}
              >
                {/* Background PDF page rendered via PDF.js */}
                <canvas ref={previewCanvasRef} className="block" />

                {renderingPage && (
                  <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center text-xs text-slate-300 gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-brand-400" />
                    Rendering Page {currentPage}...
                  </div>
                )}

                {/* Draggable Signature Stamp Overlay Box */}
                {signatureDataUrl && (
                  <div
                    onMouseDown={handleStampMouseDown}
                    className="signature-stamp-box absolute border-2 border-brand-500 bg-brand-500/10 rounded-lg flex items-center justify-center cursor-move shadow-lg group hover:border-brand-400 hover:bg-brand-500/15 transition-colors"
                    style={{
                      left: `${stampPixelPos.x}px`,
                      top: `${stampPixelPos.y}px`,
                      width: `${stampPixelSize.width}px`,
                      height: `${stampPixelSize.height}px`,
                    }}
                  >
                    <img
                      src={signatureDataUrl}
                      alt="Signature Stamp"
                      className="max-w-full max-h-full object-contain pointer-events-none"
                    />

                    {/* Drag Handle Badge */}
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-brand-600 rounded text-[9px] font-bold text-white shadow flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <Move className="w-2.5 h-2.5" /> Drag
                    </div>

                    {/* Corner Dots */}
                    <div className="absolute -top-1 -left-1 w-2 h-2 bg-brand-400 rounded-full" />
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-brand-400 rounded-full" />
                    <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-brand-400 rounded-full" />
                    <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-brand-400 rounded-full" />
                  </div>
                )}

                {/* Notice if no signature created yet */}
                {!signatureDataUrl && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-slate-300 flex items-center gap-2 shadow-lg backdrop-blur-sm">
                      <PenTool className="w-4 h-4 text-brand-400" />
                      Draw or import a signature on the left to see live placement
                    </div>
                  </div>
                )}
              </div>

              {/* Real-time PDF Coordinate Details Chip */}
              <div className="flex items-center justify-between w-full text-[11px] text-slate-400 bg-slate-800/40 px-3.5 py-1.5 rounded-lg border border-slate-800">
                <span className="font-mono">
                  Target: Page {currentPage} • X: {pdfX} pt, Y: {pdfY} pt
                </span>
                <span className="font-mono">
                  Size: {pdfWidth} × {pdfHeight} pt
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: PAdES CRYPTOGRAPHIC SIGN ==================== */}
      {signType === 'crypto' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Certificate Settings & Inputs */}
            <div className="lg:col-span-5 space-y-4">
              {serverCertPath ? (
                <div className="p-3.5 rounded-xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-brand-300">
                    <CheckCircle className="w-4 h-4 text-brand-400" />
                    <span>
                      Using Session Cert:{' '}
                      <strong className="text-white font-mono">{generatedCert?.name || 'local_certificate.pfx'}</strong>
                    </span>
                  </div>
                  <button
                    onClick={() => setServerCertPath(null)}
                    className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-slate-300">
                    Select Digital Certificate (.pfx or .p12)
                  </label>
                  <input
                    type="file"
                    accept=".pfx,.p12"
                    onChange={(e) => setCertFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:bg-brand-600 file:text-white hover:file:bg-brand-500"
                  />
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300">Certificate Passphrase</label>
                  <input
                    type="password"
                    value={certPassphrase}
                    onChange={(e) => setCertPassphrase(e.target.value)}
                    placeholder="Passphrase"
                    className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300">Signing Reason</label>
                    <input
                      type="text"
                      value={signReason}
                      onChange={(e) => setSignReason(e.target.value)}
                      placeholder="Reason"
                      className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-300">Signing Location</label>
                    <input
                      type="text"
                      value={signLocation}
                      onChange={(e) => setSignLocation(e.target.value)}
                      placeholder="e.g., Local Desktop"
                      className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              </div>

              {/* Visible Signature Option */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-800/40 border border-slate-700/80 cursor-pointer hover:bg-slate-800/60 transition-colors">
                <input
                  type="checkbox"
                  checked={isCryptoVisible}
                  onChange={(e) => setIsCryptoVisible(e.target.checked)}
                  className="w-4 h-4 rounded text-brand-600 accent-brand-500 cursor-pointer mt-0.5"
                />
                <div>
                  <span className="text-xs font-semibold text-slate-200 block">
                    Visible On-Page Signature Box (Official Certificate Seal)
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Draws the official verification box on page {currentPage} at your chosen position.
                  </span>
                </div>
              </label>

              {/* Quick Snap Presets for Crypto */}
              {isCryptoVisible && (
                <div className="p-3 bg-slate-800/30 border border-slate-800 rounded-xl space-y-2">
                  <span className="text-[10px] text-slate-400 block">Quick Placement Presets:</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'bottom-right', label: 'Bottom-Right' },
                      { id: 'bottom-left', label: 'Bottom-Left' },
                      { id: 'bottom-center', label: 'Bottom-Mid' },
                      { id: 'center', label: 'Center' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => applyPresetPosition(p.id as any)}
                        className="py-1 px-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-slate-300 text-center transition-colors truncate"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleCryptoSign}
                disabled={!selectedFile || (!certFile && !serverCertPath) || currentJob.status === 'running'}
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                {currentJob.status === 'running' ? 'Cryptographically Signing with pyHanko...' : 'Sign with PAdES Certificate'}
              </button>
            </div>

            {/* Right Column: PDF Preview with Official Signature Stamp */}
            <div className="lg:col-span-7 flex flex-col items-center justify-start space-y-3">
              {/* Page Navigator */}
              <div className="w-full flex items-center justify-between bg-slate-800/60 border border-slate-800 px-3.5 py-2 rounded-xl text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <Move className="w-4 h-4 text-brand-400" />
                  <span className="font-medium">
                    {isCryptoVisible
                      ? 'Drag the official signature box to position it on the document:'
                      : 'Document Page View (Invisible signature mode):'}
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

              {/* Document Container */}
              <div
                ref={previewContainerRef}
                onClick={isCryptoVisible ? handleContainerClick : undefined}
                onMouseMove={handleContainerMouseMove}
                onMouseUp={handleContainerMouseUp}
                className="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl select-none cursor-pointer"
                style={{
                  width: canvasDimensions.width > 0 ? `${canvasDimensions.width}px` : '100%',
                  height: canvasDimensions.height > 0 ? `${canvasDimensions.height}px` : '600px',
                }}
              >
                <canvas ref={previewCanvasRef} className="block" />

                {renderingPage && (
                  <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center text-xs text-slate-300 gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-brand-400" />
                    Rendering Page {currentPage}...
                  </div>
                )}

                {/* Official Visible Signature Stamp Box */}
                {isCryptoVisible && (
                  <div
                    onMouseDown={handleStampMouseDown}
                    className="signature-stamp-box absolute border-2 border-brand-500 bg-brand-900/40 backdrop-blur-xs rounded-lg p-2 flex flex-col justify-between cursor-move shadow-lg group hover:border-brand-400 transition-colors"
                    style={{
                      left: `${stampPixelPos.x}px`,
                      top: `${stampPixelPos.y}px`,
                      width: `${Math.max(160, stampPixelSize.width)}px`,
                      height: `${Math.max(65, stampPixelSize.height)}px`,
                    }}
                  >
                    <div className="text-[10px] text-slate-200 font-mono leading-tight space-y-0.5 pointer-events-none">
                      <div className="font-bold text-brand-300 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-brand-400" /> [DIGITALLY SIGNED]
                      </div>
                      <div className="truncate text-white">Signer: {generatedCert?.name || 'Authorized Signer'}</div>
                      <div className="truncate text-slate-300">Reason: {signReason}</div>
                      <div className="truncate text-slate-400">Loc: {signLocation}</div>
                    </div>

                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-brand-600 rounded text-[9px] font-bold text-white shadow flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <Move className="w-2.5 h-2.5" /> Drag
                    </div>
                  </div>
                )}
              </div>

              {/* Target info chip */}
              <div className="flex items-center justify-between w-full text-[11px] text-slate-400 bg-slate-800/40 px-3.5 py-1.5 rounded-lg border border-slate-800">
                <span className="font-mono">
                  {isCryptoVisible
                    ? `Target: Page ${currentPage} • X: ${pdfX} pt, Y: ${pdfY} pt`
                    : 'Mode: Standard Invisible Cryptographic PAdES Signature'}
                </span>
                <span className="font-mono">{isCryptoVisible ? 'Visible Box: Active' : 'No On-Page Ink'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 3: GENERATE SELF-SIGNED CERTIFICATE ==================== */}
      {signType === 'generate_cert' && (
        <div className="space-y-4 max-w-2xl mx-auto">
          <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
            <Key className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
            <div>
              Generate an offline, self-signed 2048-bit RSA PKCS#12 (.pfx) digital certificate directly on your machine.
              No internet connection, certificate authority registration, or cloud transmission is needed.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300">Signer Common Name</label>
              <input
                type="text"
                value={newCertName}
                onChange={(e) => setNewCertName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300">Organization Name</label>
              <input
                type="text"
                value={newCertOrg}
                onChange={(e) => setNewCertOrg(e.target.value)}
                placeholder="e.g. LocalPDF Suite"
                className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300">Protect with Passphrase</label>
              <input
                type="password"
                value={newCertPass}
                onChange={(e) => setNewCertPass(e.target.value)}
                placeholder="Enter passphrase"
                className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300">Validity (Days)</label>
              <input
                type="number"
                min={30}
                max={3650}
                value={newCertDays}
                onChange={(e) => setNewCertDays(Number(e.target.value))}
                className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <button
            onClick={handleGenerateCert}
            disabled={currentJob.status === 'running' || !newCertName || !newCertPass}
            className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
          >
            <Key className="w-4 h-4" />
            {currentJob.status === 'running' ? 'Generating RSA 2048-bit Certificate...' : 'Generate New PKCS#12 (.pfx)'}
          </button>

          {/* Quick-use banner when certificate is generated */}
          {generatedCert && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 text-xs">
                <CheckCircle className="w-4 h-4" />
                <span>
                  Certificate <strong>{generatedCert.name}</strong> created and ready!
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {currentJob.downloadUrl && (
                  <button
                    onClick={() => triggerDownload(currentJob.downloadUrl!, generatedCert.name)}
                    className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download .pfx File
                  </button>
                )}
                <button
                  onClick={handleUseGeneratedCert}
                  className="py-1.5 px-3 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> Use to Sign PDF Now
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Global Result feedback (when not in generate_cert with custom banner) */}
      {signType !== 'generate_cert' && currentJob.status === 'success' && currentJob.downloadUrl && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-emerald-400 text-xs">
            <CheckCircle className="w-4 h-4" />
            <span className="font-medium">{currentJob.message}</span>
          </div>
          <button
            onClick={() => triggerDownload(currentJob.downloadUrl!)}
            className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Save Signed Document
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
