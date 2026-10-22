import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useAppStore, showToast } from '../../store/useAppStore';
import { useSidecar, readFileData } from '../../hooks/useSidecar';
import { PdfEditItem } from '../../types';
import {
  Edit3,
  Type,
  Eraser,
  Highlighter,
  Square,
  Image as ImageIcon,
  Save,
  Download,
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Undo2,
  MousePointer,
  Bold,
  Italic,
  Layers,
  Wrench,
  Plus,
  X,
  FileText,
  Move,
  Maximize2,
} from 'lucide-react';

// Configure PDF.js worker locally for 100% offline air-gapped support
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

type EditToolMode = 'select' | 'edit_text' | 'add_text' | 'whiteout' | 'highlight' | 'shape';

interface DetectedTextBlock {
  id: string;
  str: string;
  canvasX: number;
  canvasY: number;
  canvasWidth: number;
  canvasHeight: number;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  pdfBaselineY: number;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
}

export const EditPdfPanel: React.FC = () => {
  const { files, selectedFile, setSelectedFile, currentJob } = useAppStore();
  const { callApi, triggerDownload } = useSidecar();

  // Active tool mode
  const [activeMode, setActiveMode] = useState<EditToolMode>('edit_text');

  // Multi-page navigation
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pagePtSize, setPagePtSize] = useState<{ width: number; height: number }>({ width: 595, height: 842 });
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 600, height: 800 });

  // Page detected text blocks (for in-place editing)
  const [detectedBlocks, setDetectedBlocks] = useState<DetectedTextBlock[]>([]);
  const [loadingPage, setLoadingPage] = useState(false);

  // Per-file edits map (Fix 4: ensures edits never leak across files or when cleared)
  const [fileEditsMap, setFileEditsMap] = useState<Record<string, PdfEditItem[]>>({});
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);

  // Formatting state
  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState('Helvetica');
  const [hexColor, setHexColor] = useState('#0f172a');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);

  // In-place text editor modal
  const [editingBlock, setEditingBlock] = useState<DetectedTextBlock | null>(null);
  const [replacementText, setReplacementText] = useState('');

  // Add new text inline prompt
  const [inlineNewText, setInlineNewText] = useState<{
    canvasX: number;
    canvasY: number;
    pdfX: number;
    pdfY: number;
  } | null>(null);
  const [newTextValue, setNewTextValue] = useState('');

  // Dragging/Drawing state
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDrawBox, setCurrentDrawBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Interactive Move & Resize state for placed elements (Fix 3)
  const [draggingItem, setDraggingItem] = useState<{
    id: string;
    startMouseX: number;
    startMouseY: number;
    startItemX: number;
    startItemY: number;
  } | null>(null);

  const [resizingItem, setResizingItem] = useState<{
    id: string;
    startMouseX: number;
    startMouseY: number;
    startW: number;
    startH: number;
  } | null>(null);

  // Image upload input ref
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Canvas & Container refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Find active PDF file
  const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
  const activePdf =
    selectedFile && selectedFile.name.toLowerCase().endsWith('.pdf')
      ? selectedFile
      : pdfFiles[0] || null;

  // Active edits list for current document
  const currentDocEdits = activePdf ? fileEditsMap[activePdf.id] || [] : [];

  // Helper to update edits for active PDF
  const updateCurrentDocEdits = useCallback(
    (updater: (prev: PdfEditItem[]) => PdfEditItem[]) => {
      if (!activePdf) return;
      setFileEditsMap((map) => {
        const existing = map[activePdf.id] || [];
        const next = updater(existing);
        return { ...map, [activePdf.id]: next };
      });
    },
    [activePdf]
  );

  // Fix 4: Reset state when active document is cleared or changed
  const activePdfIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activePdf?.id !== activePdfIdRef.current) {
      activePdfIdRef.current = activePdf?.id || null;
      setSelectedEditId(null);
      setEditingBlock(null);
      setInlineNewText(null);
      setCurrentPage(1);
    }
  }, [activePdf?.id]);

  // Clean up fileEditsMap when files are removed
  useEffect(() => {
    if (files.length === 0) {
      setFileEditsMap({});
      setSelectedEditId(null);
      setEditingBlock(null);
      setInlineNewText(null);
    }
  }, [files.length]);

  // Coordinate scales
  const scale = canvasDimensions.width / (pagePtSize.width || 1);
  const scaleX = pagePtSize.width / (canvasDimensions.width || 1);
  const scaleY = pagePtSize.height / (canvasDimensions.height || 1);

  // 1. Render PDF page and extract text blocks with precise font metadata (Fix 1)
  useEffect(() => {
    if (!activePdf) return;

    let isCancelled = false;
    setLoadingPage(true);
    setDetectedBlocks([]);

    const renderPage = async () => {
      try {
        let arrayBuffer: ArrayBuffer;
        if (activePdf.fileObj) {
          arrayBuffer = await activePdf.fileObj.arrayBuffer();
        } else {
          arrayBuffer = await readFileData(activePdf.path);
        }

        if (isCancelled) return;

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (isCancelled) return;

        setTotalPages(pdf.numPages);

        const page = await pdf.getPage(currentPage);
        const originalViewport = page.getViewport({ scale: 1.0 });
        setPagePtSize({ width: originalViewport.width, height: originalViewport.height });

        // Responsive rendering scale
        const containerWidth = containerRef.current?.clientWidth || 700;
        const targetWidth = Math.min(containerWidth - 32, 750);
        const pageScale = targetWidth / originalViewport.width;
        const viewport = page.getViewport({ scale: pageScale });

        setCanvasDimensions({ width: viewport.width, height: viewport.height });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d')!;
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport }).promise;

        // Extract text items with exact coordinates and font styles
        const textContent = await page.getTextContent();
        const styles = textContent.styles || {};
        const blocks: DetectedTextBlock[] = [];

        textContent.items.forEach((item: any, idx: number) => {
          const str = (item.str || '').trim();
          if (!str) return;

          // Transform matrix: [scaleX, skewY, skewX, scaleY, tx, ty]
          const tx = item.transform[4];
          const ty = item.transform[5]; // PDF baseline Y
          const fontHeight = Math.abs(item.transform[0] || item.height || 12);
          const fontWidth = item.width || fontHeight * str.length * 0.6;

          // Detect font family & variant
          const fontStyle = styles[item.fontName] || {};
          const rawFontName = (item.fontName || '').toLowerCase();
          const rawFamily = (fontStyle.fontFamily || '').toLowerCase();

          let detectedFamily = 'Helvetica';
          if (rawFontName.includes('times') || rawFamily.includes('serif') || rawFamily.includes('roman')) {
            detectedFamily = 'Times';
          } else if (rawFontName.includes('courier') || rawFamily.includes('mono') || rawFontName.includes('code')) {
            detectedFamily = 'Courier';
          }

          const bold =
            rawFontName.includes('bold') ||
            rawFontName.includes('black') ||
            rawFontName.includes('heavy') ||
            rawFontName.includes('b1');
          const italic =
            rawFontName.includes('italic') ||
            rawFontName.includes('oblique') ||
            rawFontName.includes('it');

          // Convert PDF coordinates to Canvas coordinates aligned to text baseline
          const canvasX = Math.round(tx * pageScale);
          const canvasY = Math.round((originalViewport.height - ty - fontHeight * 0.85) * pageScale);
          const canvasWidth = Math.max(16, Math.round(fontWidth * pageScale));
          const canvasHeight = Math.max(12, Math.round(fontHeight * 1.25 * pageScale));

          blocks.push({
            id: `text_blk_${currentPage}_${idx}`,
            str,
            canvasX,
            canvasY,
            canvasWidth,
            canvasHeight,
            pdfX: Math.round(tx * 10) / 10,
            pdfY: Math.round((ty - fontHeight * 0.25) * 10) / 10,
            pdfWidth: Math.round((fontWidth + 4) * 10) / 10,
            pdfHeight: Math.round((fontHeight * 1.25) * 10) / 10,
            pdfBaselineY: Math.round(ty * 10) / 10,
            fontSize: Math.round(fontHeight * 10) / 10,
            fontFamily: detectedFamily,
            bold,
            italic,
          });
        });

        if (!isCancelled) {
          setDetectedBlocks(blocks);
        }
      } catch (err) {
        console.error('Failed to render PDF page for direct editing:', err);
      } finally {
        if (!isCancelled) setLoadingPage(false);
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [activePdf, currentPage]);

  // 2. Mouse Down on Canvas (Fix 2: Add New Text does NOT jump when clicking buttons)
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // If an inline prompt is open or dragging/resizing, do not re-trigger
    if (inlineNewText || draggingItem || resizingItem) return;

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeMode === 'add_text') {
      const pdfX = Math.round(x * scaleX * 10) / 10;
      const pdfY = Math.round((canvasDimensions.height - y - fontSize * scale) * scaleY * 10) / 10;
      setInlineNewText({ canvasX: x, canvasY: y, pdfX, pdfY });
      setNewTextValue('');
      return;
    }

    if (['whiteout', 'highlight', 'shape'].includes(activeMode)) {
      setDrawingStart({ x, y });
      setCurrentDrawBox({ x, y, w: 0, h: 0 });
    } else if (activeMode === 'select') {
      setSelectedEditId(null);
    }
  };

  // 3. Mouse Move on Canvas (Handles Drawing, Moving, and Resizing - Fix 3)
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Case A: Moving an Item (Fix 3)
    if (draggingItem) {
      const dx = e.clientX - draggingItem.startMouseX;
      const dy = e.clientY - draggingItem.startMouseY;
      const newX = Math.max(0, draggingItem.startItemX + dx);
      const newY = Math.max(0, draggingItem.startItemY + dy);

      updateCurrentDocEdits((prev) =>
        prev.map((item) => {
          if (item.id === draggingItem.id) {
            const pdfX = Math.round(newX * scaleX * 10) / 10;
            const pdfY = Math.round((canvasDimensions.height - newY - item.canvasHeight) * scaleY * 10) / 10;
            return {
              ...item,
              canvasX: newX,
              canvasY: newY,
              pdfX,
              pdfY,
              baselineY: pdfY,
            };
          }
          return item;
        })
      );
      return;
    }

    // Case B: Resizing an Item (Fix 3)
    if (resizingItem) {
      const dx = e.clientX - resizingItem.startMouseX;
      const dy = e.clientY - resizingItem.startMouseY;
      const newW = Math.max(24, resizingItem.startW + dx);
      const newH = Math.max(16, resizingItem.startH + dy);

      updateCurrentDocEdits((prev) =>
        prev.map((item) => {
          if (item.id === resizingItem.id) {
            const pdfWidth = Math.round(newW * scaleX * 10) / 10;
            const pdfHeight = Math.round(newH * scaleY * 10) / 10;
            const pdfY = Math.round((canvasDimensions.height - item.canvasY - newH) * scaleY * 10) / 10;
            return {
              ...item,
              canvasWidth: newW,
              canvasHeight: newH,
              pdfWidth,
              pdfHeight,
              pdfY,
            };
          }
          return item;
        })
      );
      return;
    }

    // Case C: Drawing a new box
    if (drawingStart) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      const x = Math.min(drawingStart.x, curX);
      const y = Math.min(drawingStart.y, curY);
      const w = Math.abs(curX - drawingStart.x);
      const h = Math.abs(curY - drawingStart.y);

      setCurrentDrawBox({ x, y, w, h });
    }
  };

  // 4. Mouse Up
  const handleCanvasMouseUp = () => {
    if (draggingItem) {
      setDraggingItem(null);
      return;
    }
    if (resizingItem) {
      setResizingItem(null);
      return;
    }

    if (drawingStart && currentDrawBox && currentDrawBox.w > 4 && currentDrawBox.h > 4) {
      const pdfX = Math.round(currentDrawBox.x * scaleX * 10) / 10;
      const pdfY = Math.round((canvasDimensions.height - currentDrawBox.y - currentDrawBox.h) * scaleY * 10) / 10;
      const pdfWidth = Math.round(currentDrawBox.w * scaleX * 10) / 10;
      const pdfHeight = Math.round(currentDrawBox.h * scaleY * 10) / 10;

      const newEditItem: PdfEditItem = {
        id: `edit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        pageNumber: currentPage,
        type: activeMode as any,
        canvasX: currentDrawBox.x,
        canvasY: currentDrawBox.y,
        canvasWidth: currentDrawBox.w,
        canvasHeight: currentDrawBox.h,
        pdfX,
        pdfY,
        pdfWidth,
        pdfHeight,
        hexColor: activeMode === 'whiteout' ? '#FFFFFF' : activeMode === 'highlight' ? '#FDE047' : hexColor,
        opacity: activeMode === 'highlight' ? 0.4 : 1.0,
        strokeColor: hexColor,
        strokeWidth: 2,
      };

      updateCurrentDocEdits((prev) => [...prev, newEditItem]);
      setSelectedEditId(newEditItem.id);
    }

    setDrawingStart(null);
    setCurrentDrawBox(null);
  };

  // 5. Confirm New Text (Fix 2: cleanly adds text and doesn't jump)
  const handleConfirmNewText = () => {
    if (!inlineNewText || !newTextValue.trim()) {
      setInlineNewText(null);
      return;
    }

    const estimatedWidth = Math.max(50, newTextValue.length * fontSize * scale * 0.65);
    const estimatedHeight = Math.max(20, fontSize * scale * 1.3);

    const newEditItem: PdfEditItem = {
      id: `text_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      pageNumber: currentPage,
      type: 'text',
      canvasX: inlineNewText.canvasX,
      canvasY: inlineNewText.canvasY,
      canvasWidth: estimatedWidth,
      canvasHeight: estimatedHeight,
      pdfX: inlineNewText.pdfX,
      pdfY: inlineNewText.pdfY,
      pdfWidth: Math.round(estimatedWidth * scaleX * 10) / 10,
      pdfHeight: Math.round(estimatedHeight * scaleY * 10) / 10,
      baselineY: inlineNewText.pdfY,
      text: newTextValue,
      fontSize,
      fontFamily,
      hexColor,
      bold: isBold,
      italic: isItalic,
    };

    updateCurrentDocEdits((prev) => [...prev, newEditItem]);
    setSelectedEditId(newEditItem.id);
    setInlineNewText(null);
    setNewTextValue('');
  };

  // 6. In-Place Text Edit (Fix 1: Matches exact detected font, size, weight, and baseline)
  const handleStartInPlaceEdit = (block: DetectedTextBlock) => {
    setEditingBlock(block);
    setReplacementText(block.str);
    setFontSize(block.fontSize);
    setFontFamily(block.fontFamily);
    setIsBold(block.bold);
    setIsItalic(block.italic);
  };

  const handleConfirmInPlaceEdit = () => {
    if (!editingBlock) return;

    if (!replacementText.trim()) {
      // If user wiped the text, act as a clean whiteout
      const whiteoutItem: PdfEditItem = {
        id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        pageNumber: currentPage,
        type: 'whiteout',
        canvasX: editingBlock.canvasX,
        canvasY: editingBlock.canvasY,
        canvasWidth: editingBlock.canvasWidth,
        canvasHeight: editingBlock.canvasHeight,
        pdfX: editingBlock.pdfX,
        pdfY: editingBlock.pdfY,
        pdfWidth: editingBlock.pdfWidth,
        pdfHeight: editingBlock.pdfHeight,
        hexColor: '#FFFFFF',
      };
      updateCurrentDocEdits((prev) => [...prev, whiteoutItem]);
    } else {
      // Scaled width for replacement text
      const newWidth = Math.max(editingBlock.canvasWidth, replacementText.length * fontSize * scale * 0.65);

      const replacementItem: PdfEditItem = {
        id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        pageNumber: currentPage,
        type: 'text_replacement',
        canvasX: editingBlock.canvasX,
        canvasY: editingBlock.canvasY,
        canvasWidth: newWidth,
        canvasHeight: editingBlock.canvasHeight,
        pdfX: editingBlock.pdfX,
        pdfY: editingBlock.pdfY,
        pdfWidth: Math.max(editingBlock.pdfWidth, Math.round(newWidth * scaleX * 10) / 10),
        pdfHeight: editingBlock.pdfHeight,
        baselineY: editingBlock.pdfBaselineY,
        text: replacementText,
        fontSize,
        fontFamily,
        hexColor,
        bold: isBold,
        italic: isItalic,
        originalText: editingBlock.str,
        backgroundPatch: {
          x: editingBlock.pdfX - 2,
          y: editingBlock.pdfY - 1,
          width: Math.max(editingBlock.pdfWidth, Math.round(newWidth * scaleX * 10) / 10) + 4,
          height: editingBlock.pdfHeight + 2,
          color: '#FFFFFF',
        },
      };
      updateCurrentDocEdits((prev) => [...prev, replacementItem]);
    }

    setEditingBlock(null);
    setReplacementText('');
  };

  // 7. Image Upload (Fix 3: creates movable and resizable image)
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        const aspect = img.width / img.height;
        const initialW = 140;
        const initialH = Math.round(initialW / aspect);

        const imageItem: PdfEditItem = {
          id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          pageNumber: currentPage,
          type: 'image',
          canvasX: 80,
          canvasY: 80,
          canvasWidth: initialW,
          canvasHeight: initialH,
          pdfX: Math.round(80 * scaleX * 10) / 10,
          pdfY: Math.round((canvasDimensions.height - 80 - initialH) * scaleY * 10) / 10,
          pdfWidth: Math.round(initialW * scaleX * 10) / 10,
          pdfHeight: Math.round(initialH * scaleY * 10) / 10,
          imageData: base64,
          opacity: 1.0,
        };

        updateCurrentDocEdits((prev) => [...prev, imageItem]);
        setSelectedEditId(imageItem.id);
        setActiveMode('select');
      };
      img.src = base64;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 8. Delete Edit
  const deleteEdit = (id: string) => {
    updateCurrentDocEdits((prev) => prev.filter((item) => item.id !== id));
    if (selectedEditId === id) setSelectedEditId(null);
  };

  // 9. Save Edited PDF
  const handleSaveEditedPdf = async () => {
    if (!activePdf) {
      showToast('Please upload and select a PDF document first.', 'warning');
      return;
    }

    if (currentDocEdits.length === 0) {
      showToast('No edits have been added yet. Edit text, add new words, or erase areas before saving.', 'warning');
      return;
    }

    const payloadEdits = currentDocEdits.map((item) => ({
      page_number: item.pageNumber,
      type: item.type,
      x: item.pdfX,
      y: item.pdfY,
      width: item.pdfWidth,
      height: item.pdfHeight,
      baseline_y: item.baselineY,
      text: item.text,
      font_size: item.fontSize,
      font_family: item.fontFamily,
      hex_color: item.hexColor,
      bold: item.bold,
      italic: item.italic,
      opacity: item.opacity,
      background_patch: item.backgroundPatch,
      image_data: item.imageData,
      stroke_color: item.strokeColor,
      stroke_width: item.strokeWidth,
      fill_color: item.fillColor,
    }));

    await callApi('/api/edit/apply', {
      file_path: activePdf.path,
      edits: payloadEdits,
      flatten: true,
      output_filename: `edited_${activePdf.name}`,
    });
  };

  const currentPageEdits = currentDocEdits.filter((item) => item.pageNumber === currentPage);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-brand-400" />
            Edit PDF (Direct In-Place Editing)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Click existing text to update it with matching font, add new text, erase sections, or stamp & resize images directly.
          </p>
        </div>

        {/* Multi-document selector */}
        {pdfFiles.length > 1 && (
          <div className="flex items-center space-x-1.5 text-xs bg-slate-950 p-1 rounded-xl border border-slate-800">
            <span className="text-slate-400 px-2">Document:</span>
            {pdfFiles.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFile(f)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium truncate max-w-[150px] transition-all ${
                  activePdf?.id === f.id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={f.name}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Editor Tool Selection Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => {
              setActiveMode('select');
              setInlineNewText(null);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeMode === 'select'
                ? 'bg-brand-600 text-white shadow-md'
                : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
            }`}
            title="Select, move, or resize placed items"
          >
            <MousePointer className="w-3.5 h-3.5" /> Move / Resize
          </button>

          <button
            onClick={() => {
              setActiveMode('edit_text');
              setInlineNewText(null);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeMode === 'edit_text'
                ? 'bg-brand-600 text-white shadow-md'
                : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
            }`}
            title="Click any existing text block to edit it in place"
          >
            <Edit3 className="w-3.5 h-3.5" /> Edit Existing Text
          </button>

          <button
            onClick={() => {
              setActiveMode('add_text');
              setSelectedEditId(null);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeMode === 'add_text'
                ? 'bg-brand-600 text-white shadow-md'
                : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
            }`}
            title="Click anywhere on the document to add new text"
          >
            <Type className="w-3.5 h-3.5" /> Add New Text
          </button>

          <button
            onClick={() => {
              setActiveMode('whiteout');
              setInlineNewText(null);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeMode === 'whiteout'
                ? 'bg-brand-600 text-white shadow-md'
                : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
            }`}
            title="Drag to erase/whiteout unwanted text or images"
          >
            <Eraser className="w-3.5 h-3.5" /> Whiteout / Erase
          </button>

          <button
            onClick={() => {
              setActiveMode('highlight');
              setInlineNewText(null);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeMode === 'highlight'
                ? 'bg-brand-600 text-white shadow-md'
                : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
            }`}
            title="Highlight text with translucent marker"
          >
            <Highlighter className="w-3.5 h-3.5" /> Highlight
          </button>

          <button
            onClick={() => imageInputRef.current?.click()}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-slate-800/60 text-slate-300 hover:bg-slate-800 transition-all"
            title="Insert a movable and resizable PNG/JPEG image or stamp"
          >
            <ImageIcon className="w-3.5 h-3.5" /> Insert Image
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageFileChange}
          />
        </div>

        {/* Styling controls (Font, Size, Color, Weight) */}
        {(activeMode === 'edit_text' || activeMode === 'add_text') && (
          <div className="flex items-center gap-2 text-xs">
            {/* Font Family */}
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs focus:outline-none"
            >
              <option value="Helvetica">Helvetica (Sans)</option>
              <option value="Times">Times (Serif)</option>
              <option value="Courier">Courier (Mono)</option>
            </select>

            {/* Font Size */}
            <select
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs focus:outline-none"
            >
              {[9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map((s) => (
                <option key={s} value={s}>
                  {s} pt
                </option>
              ))}
            </select>

            {/* Bold / Italic */}
            <button
              onClick={() => setIsBold(!isBold)}
              className={`p-1.5 rounded-lg border transition-all ${
                isBold
                  ? 'bg-brand-600 border-brand-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
              title="Bold"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsItalic(!isItalic)}
              className={`p-1.5 rounded-lg border transition-all ${
                isItalic
                  ? 'bg-brand-600 border-brand-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
              title="Italic"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>

            {/* Color Picker */}
            <div className="flex items-center space-x-1 pl-1">
              {['#0f172a', '#dc2626', '#2563eb', '#16a34a'].map((c) => (
                <button
                  key={c}
                  onClick={() => setHexColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${
                    hexColor.toLowerCase() === c.toLowerCase() ? 'scale-125 border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={hexColor}
                onChange={(e) => setHexColor(e.target.value)}
                className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0 ml-1"
                title="Custom Color"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Interactive Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Canvas Preview with Interactive Overlays */}
        <div className="lg:col-span-8 flex flex-col items-center">
          {/* Top Page Navigation Bar */}
          <div className="flex items-center justify-between w-full max-w-[750px] mb-3 px-1 text-xs text-slate-400">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-300">
                Mode:{' '}
                {activeMode === 'select'
                  ? 'Click & drag any item to move or resize it'
                  : activeMode === 'edit_text'
                  ? 'Click any existing text to update it'
                  : activeMode === 'add_text'
                  ? 'Click anywhere to add text'
                  : 'Click & drag to draw'}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || loadingPage}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono text-slate-200">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || loadingPage}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Document Viewport */}
          <div
            ref={containerRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            className="relative bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden select-none"
            style={{
              width: canvasDimensions.width,
              height: canvasDimensions.height,
              cursor: activeMode === 'select' ? 'default' : 'crosshair',
            }}
          >
            {/* Base PDF Canvas */}
            <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

            {/* Mode A: Detected Text Blocks (In-Place Edit) */}
            {activeMode === 'edit_text' &&
              detectedBlocks.map((block) => (
                <div
                  key={block.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartInPlaceEdit(block);
                  }}
                  className="absolute border border-dashed border-transparent hover:border-brand-400 hover:bg-brand-500/15 cursor-pointer rounded transition-all group z-10"
                  style={{
                    left: block.canvasX,
                    top: block.canvasY,
                    width: block.canvasWidth,
                    height: block.canvasHeight,
                  }}
                  title={`Click to edit: "${block.str}" (${block.fontFamily} ${block.fontSize}pt)`}
                >
                  <span className="opacity-0 group-hover:opacity-100 absolute -top-4 left-0 text-[9px] bg-brand-600 text-white px-1 rounded shadow pointer-events-none whitespace-nowrap">
                    Edit {block.fontSize}pt
                  </span>
                </div>
              ))}

            {/* Mode B: Rendered Edits on Current Page (With Drag-to-Move and Drag-to-Resize - Fix 3) */}
            {currentPageEdits.map((item) => {
              const isSelected = selectedEditId === item.id;

              return (
                <div
                  key={item.id}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedEditId(item.id);
                    setDraggingItem({
                      id: item.id,
                      startMouseX: e.clientX,
                      startMouseY: e.clientY,
                      startItemX: item.canvasX,
                      startItemY: item.canvasY,
                    });
                  }}
                  className={`absolute group select-none transition-shadow ${
                    isSelected ? 'ring-2 ring-brand-500 shadow-2xl z-20' : 'hover:ring-1 hover:ring-slate-400/50 z-10'
                  }`}
                  style={{
                    left: item.canvasX,
                    top: item.canvasY,
                    width: item.canvasWidth,
                    height: item.canvasHeight,
                    cursor: 'grab',
                  }}
                >
                  {/* Delete button on hover / selected */}
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteEdit(item.id);
                    }}
                    className="absolute -top-3 -right-3 p-1 rounded-full bg-red-600 hover:bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-30"
                    title="Remove Edit"
                  >
                    <X className="w-3 h-3" />
                  </button>

                  {/* Move Handle Badge (Selected) */}
                  {isSelected && (
                    <div className="absolute -top-4 left-0 px-1 py-0.5 rounded bg-brand-600 text-white text-[9px] font-mono shadow pointer-events-none flex items-center gap-0.5">
                      <Move className="w-2.5 h-2.5" /> Drag to Move
                    </div>
                  )}

                  {/* Resize Handle at Bottom-Right Corner (Fix 3) */}
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelectedEditId(item.id);
                      setResizingItem({
                        id: item.id,
                        startMouseX: e.clientX,
                        startMouseY: e.clientY,
                        startW: item.canvasWidth,
                        startH: item.canvasHeight,
                      });
                    }}
                    className={`absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-brand-500 border-2 border-white shadow cursor-se-resize flex items-center justify-center transition-opacity ${
                      isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    title="Drag to resize"
                  >
                    <div className="w-1 h-1 bg-white rounded-full" />
                  </div>

                  {/* Whiteout Box */}
                  {item.type === 'whiteout' && (
                    <div
                      className="w-full h-full rounded-sm shadow-sm"
                      style={{ backgroundColor: item.hexColor || '#FFFFFF' }}
                    />
                  )}

                  {/* Highlight Box */}
                  {item.type === 'highlight' && (
                    <div
                      className="w-full h-full rounded-sm"
                      style={{ backgroundColor: item.hexColor || '#FDE047', opacity: item.opacity || 0.4 }}
                    />
                  )}

                  {/* Shape / Rectangle */}
                  {item.type === 'shape' && (
                    <div
                      className="w-full h-full rounded-sm border-2"
                      style={{
                        borderColor: item.strokeColor || '#2563EB',
                        backgroundColor: item.fillColor || 'transparent',
                      }}
                    />
                  )}

                  {/* Text / Replacement (Fix 1: visual font size scaled properly to match PDF canvas) */}
                  {(item.type === 'text' || item.type === 'text_replacement') && (
                    <div
                      className="w-full h-full flex items-center px-1 rounded-sm relative overflow-hidden"
                      style={{
                        backgroundColor: item.backgroundPatch ? item.backgroundPatch.color : 'transparent',
                        color: item.hexColor || '#0f172a',
                        fontSize: `${(item.fontSize || 12) * scale}px`,
                        fontFamily:
                          item.fontFamily === 'Times'
                            ? 'Times New Roman, serif'
                            : item.fontFamily === 'Courier'
                            ? 'Courier New, monospace'
                            : 'Helvetica, Arial, sans-serif',
                        fontWeight: item.bold ? 'bold' : 'normal',
                        fontStyle: item.italic ? 'italic' : 'normal',
                        lineHeight: 1.1,
                      }}
                    >
                      {item.text}
                    </div>
                  )}

                  {/* Image (Fix 3: fully resizable and movable) */}
                  {item.type === 'image' && item.imageData && (
                    <img
                      src={item.imageData}
                      alt="Placed image"
                      className="w-full h-full object-contain pointer-events-none rounded shadow-sm"
                    />
                  )}
                </div>
              );
            })}

            {/* Mode C: Inline New Text Box Prompt (Fix 2: stopped event bubbling so clicks don't jump) */}
            {inlineNewText && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="absolute z-30 bg-slate-900 border-2 border-brand-500 rounded-xl p-2.5 shadow-2xl flex items-center gap-2"
                style={{ left: inlineNewText.canvasX, top: inlineNewText.canvasY }}
              >
                <input
                  type="text"
                  autoFocus
                  value={newTextValue}
                  onChange={(e) => setNewTextValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmNewText();
                    if (e.key === 'Escape') setInlineNewText(null);
                  }}
                  placeholder="Type your text..."
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-none min-w-[180px]"
                  style={{
                    color: hexColor,
                    fontWeight: isBold ? 'bold' : 'normal',
                    fontStyle: isItalic ? 'italic' : 'normal',
                  }}
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConfirmNewText();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow transition-colors"
                >
                  Add
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setInlineNewText(null);
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Currently drawing drag box */}
            {currentDrawBox && (
              <div
                className="absolute border-2 border-brand-400 bg-brand-500/20 pointer-events-none z-30 rounded-sm"
                style={{
                  left: currentDrawBox.x,
                  top: currentDrawBox.y,
                  width: currentDrawBox.w,
                  height: currentDrawBox.h,
                }}
              />
            )}
          </div>
        </div>

        {/* Right Column: In-Place Text Editor & Edits Manager */}
        <div className="lg:col-span-4 space-y-4">
          {/* Active In-Place Text Editor Modal Card (Fix 1: Pre-filled with detected font & size) */}
          {editingBlock ? (
            <div className="p-4 rounded-2xl bg-brand-500/10 border border-brand-500/30 space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-brand-300 flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4" /> Edit Selected Text
                </span>
                <button
                  onClick={() => setEditingBlock(null)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Original Text:</span>
                  <span className="font-mono text-slate-300">
                    {editingBlock.fontFamily} {editingBlock.fontSize}pt
                  </span>
                </div>
                <div className="text-xs p-2 rounded-lg bg-slate-950 text-slate-400 font-mono border border-slate-800">
                  {editingBlock.str}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300 font-medium">New Replacement Text:</label>
                <textarea
                  rows={2}
                  value={replacementText}
                  onChange={(e) => setReplacementText(e.target.value)}
                  placeholder="Enter replacement text..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-brand-500 font-medium"
                />
              </div>

              {/* Quick Font & Size Fine-tuning for the replacement */}
              <div className="flex items-center gap-2 text-xs pt-1">
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs"
                >
                  <option value="Helvetica">Helvetica (Sans)</option>
                  <option value="Times">Times (Serif)</option>
                  <option value="Courier">Courier (Mono)</option>
                </select>

                <select
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs"
                >
                  {[9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map((s) => (
                    <option key={s} value={s}>
                      {s} pt
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setIsBold(!isBold)}
                  className={`p-1.5 rounded-lg border transition-all ${
                    isBold
                      ? 'bg-brand-600 border-brand-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                  title="Bold"
                >
                  <Bold className="w-3 h-3" />
                </button>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <button
                  onClick={handleConfirmInPlaceEdit}
                  className="flex-1 py-2 px-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md transition-colors"
                >
                  Apply Text Update
                </button>
                <button
                  onClick={() => {
                    setReplacementText('');
                    handleConfirmInPlaceEdit();
                  }}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-red-950 text-red-400 text-xs font-semibold border border-slate-700"
                  title="Cover and erase this text block"
                >
                  Erase
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 text-xs text-slate-300 space-y-2">
              <span className="font-semibold text-brand-400 flex items-center gap-1.5">
                <Wrench className="w-4 h-4" /> Direct Editing Tools:
              </span>
              <ul className="text-slate-400 leading-relaxed text-[11px] space-y-1 list-disc list-inside">
                <li>
                  <strong>Edit Existing Text:</strong> Click any word to replace it with matching font and size.
                </li>
                <li>
                  <strong>Move / Resize:</strong> Click any placed image or text box to drag it or pull the corner handle to resize it.
                </li>
                <li>
                  <strong>Add New Text:</strong> Click anywhere on the document to type new text.
                </li>
              </ul>
            </div>
          )}

          {/* List of Edits on Current Page */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300 px-1">
              <span className="font-semibold text-slate-200">
                Page {currentPage} Edits ({currentPageEdits.length}):
              </span>
              {currentPageEdits.length > 0 && (
                <button
                  onClick={() =>
                    updateCurrentDocEdits((prev) => prev.filter((item) => item.pageNumber !== currentPage))
                  }
                  className="text-[11px] text-red-400 hover:underline"
                >
                  Clear Page Edits
                </button>
              )}
            </div>

            {currentPageEdits.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/40 border border-slate-800 rounded-xl">
                No edits on this page yet.
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {currentPageEdits.map((item, idx) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedEditId(item.id)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all cursor-pointer ${
                      selectedEditId === item.id
                        ? 'border-brand-500 bg-brand-500/10 shadow-sm'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="w-5 h-5 rounded-md bg-slate-800 text-slate-300 flex items-center justify-center font-mono text-[10px] flex-shrink-0">
                        {idx + 1}
                      </span>
                      <div className="truncate">
                        <div className="font-medium text-slate-200 capitalize truncate">
                          {item.type === 'text_replacement'
                            ? `Replace: "${item.text}"`
                            : item.type === 'text'
                            ? `Text: "${item.text}"`
                            : item.type === 'image'
                            ? 'Image / Stamp'
                            : item.type}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          pos: ({item.pdfX}, {item.pdfY}) &bull; {item.pdfWidth}&times;{item.pdfHeight}pt
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteEdit(item.id);
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white transition-colors ml-2"
                      title="Delete Edit"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action: Save & Burn Edits into PDF */}
          <div className="pt-2 border-t border-slate-800 space-y-3">
            <button
              onClick={handleSaveEditedPdf}
              disabled={currentDocEdits.length === 0 || currentJob.status === 'running'}
              className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {currentJob.status === 'running'
                ? 'Burning Edits into PDF...'
                : `Save Edited PDF (${currentDocEdits.length} Edits Total)`}
            </button>
          </div>

          {/* Result Feedback */}
          {currentJob.status === 'success' && currentJob.downloadUrl && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-emerald-400 text-xs">
                <CheckCircle className="w-4 h-4" />
                <span className="font-medium">{currentJob.message || 'Edits applied successfully!'}</span>
              </div>
              <button
                onClick={() => triggerDownload(currentJob.downloadUrl!)}
                className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download
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
      </div>
    </div>
  );
};
