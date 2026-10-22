import React, { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { readFileData } from '../../hooks/useSidecar';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { UploadedFile } from '../../types';
import { formatSize } from '../../utils/formatters';
import {
  GripVertical,
  ArrowLeft,
  ArrowRight,
  Trash2,
  FileText,
  Layers,
  LayoutGrid,
  List,
} from 'lucide-react';

interface DocumentMeta {
  thumbnail?: string;
  pageCount?: number;
  loading: boolean;
}

interface SortableDocCardProps {
  file: UploadedFile;
  index: number;
  totalFiles: number;
  meta?: DocumentMeta;
  onMove: (fromIndex: number, toIndex: number) => void;
  onRemove: (id: string) => void;
}

const SortableDocCard: React.FC<SortableDocCardProps> = ({
  file,
  index,
  totalFiles,
  meta,
  onMove,
  onRemove,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: file.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 40 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative bg-slate-900 border rounded-2xl p-3 flex flex-col justify-between select-none transition-all ${
        isDragging
          ? 'opacity-80 scale-105 border-brand-500 shadow-2xl shadow-brand-500/20'
          : 'border-slate-800 hover:border-slate-700 hover:shadow-lg'
      }`}
    >
      {/* Top Header Row: Order Badge & Drag Handle & Actions */}
      <div className="flex items-center justify-between w-full mb-2">
        <div className="flex items-center space-x-1.5">
          <div className="px-2 py-0.5 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/40 text-[11px] font-bold font-mono">
            #{index + 1}
          </div>
          {meta?.pageCount !== undefined && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
              {meta.pageCount} {meta.pageCount === 1 ? 'page' : 'pages'}
            </span>
          )}
        </div>

        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-white cursor-grab active:cursor-grabbing hover:bg-slate-700 transition-colors"
          title="Drag card to reorder merge sequence"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Document First Page (Cover) Thumbnail Preview */}
      <div className="w-full aspect-[3/4] bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800/60 relative group/thumb my-1 shadow-inner">
        {meta?.thumbnail ? (
          <img
            src={meta.thumbnail}
            alt={`${file.name} first page preview`}
            className="w-full h-full object-contain pointer-events-none transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : meta?.loading ? (
          <div className="flex flex-col items-center space-y-1.5 text-xs text-brand-400">
            <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] text-slate-400">Loading cover...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-1 text-slate-500 p-2 text-center">
            <FileText className="w-7 h-7 text-slate-600" />
            <span className="text-[10px] font-mono">PDF Document</span>
          </div>
        )}

        {/* Cover tag overlay */}
        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-slate-900/90 backdrop-blur-sm text-[9px] font-medium text-slate-400 border border-slate-800 pointer-events-none">
          Page 1 (Cover)
        </div>
      </div>

      {/* File Info */}
      <div className="mt-2 text-left">
        <div className="text-xs font-semibold text-slate-100 truncate" title={file.name}>
          {file.name}
        </div>
        <div className="text-[10px] text-slate-400 flex items-center justify-between mt-0.5">
          <span>{formatSize(file.size)}</span>
        </div>
      </div>

      {/* Bottom Reorder & Delete Bar */}
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-800/80">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => onMove(index, index - 1)}
            disabled={index === 0}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-brand-600 disabled:opacity-20 disabled:hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            title="Move earlier in sequence (Left)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onMove(index, index + 1)}
            disabled={index === totalFiles - 1}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-brand-600 disabled:opacity-20 disabled:hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            title="Move later in sequence (Right)"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          onClick={() => onRemove(file.id)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-600/80 text-slate-400 hover:text-white transition-colors"
          title="Remove from merge list"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

interface MergeInteractiveOrganizerProps {
  files: UploadedFile[];
  onMoveFile: (fromIndex: number, toIndex: number) => void;
  onRemoveFile: (id: string) => void;
  onReorderFiles: (files: UploadedFile[]) => void;
}

export const MergeInteractiveOrganizer: React.FC<MergeInteractiveOrganizerProps> = ({
  files,
  onMoveFile,
  onRemoveFile,
  onReorderFiles,
}) => {
  const [docMetaMap, setDocMetaMap] = useState<Record<string, DocumentMeta>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Render first-page cover previews for all files
  useEffect(() => {
    let isCancelled = false;

    const loadCovers = async () => {
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.pdf')) continue;
        if (docMetaMap[file.id]?.thumbnail) continue;

        setDocMetaMap((prev) => ({
          ...prev,
          [file.id]: { ...(prev[file.id] || {}), loading: true },
        }));

        try {
          let arrayBuffer: ArrayBuffer;
          if (file.fileObj) {
            arrayBuffer = await file.fileObj.arrayBuffer();
          } else {
            arrayBuffer = await readFileData(file.path);
          }

          if (isCancelled) return;

          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const pageCount = pdf.numPages;
          const firstPage = await pdf.getPage(1);
          const viewport = firstPage.getViewport({ scale: 0.35 });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d')!;
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await firstPage.render({ canvasContext: context, viewport }).promise;
          const thumbnail = canvas.toDataURL('image/jpeg', 0.85);

          if (!isCancelled) {
            setDocMetaMap((prev) => ({
              ...prev,
              [file.id]: { thumbnail, pageCount, loading: false },
            }));
          }
        } catch (err) {
          console.warn(`Failed to render cover for ${file.name}:`, err);
          if (!isCancelled) {
            setDocMetaMap((prev) => ({
              ...prev,
              [file.id]: { loading: false },
            }));
          }
        }
      }
    };

    if (files.length > 0) {
      loadCovers();
    }

    return () => {
      isCancelled = true;
    };
  }, [files]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = files.findIndex((f) => f.id === active.id);
      const newIndex = files.findIndex((f) => f.id === over.id);
      onReorderFiles(arrayMove(files, oldIndex, newIndex));
    }
  };

  const totalPagesCount = files.reduce((acc, f) => {
    const meta = docMetaMap[f.id];
    return acc + (meta?.pageCount || 1);
  }, 0);

  if (files.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-slate-500 bg-slate-950/40 border border-slate-800 rounded-2xl">
        No documents uploaded yet. Upload 2 or more PDFs above to arrange their order before merging.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar: Info and View Switcher */}
      <div className="flex items-center justify-between text-xs text-slate-300 pb-1">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-slate-200">
            Document Merge Sequence ({files.length} loaded):
          </span>
          <span className="px-2 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-400 font-mono text-[11px]">
            ~{totalPagesCount} Total Pages
          </span>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center space-x-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all ${
              viewMode === 'grid'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Interactive First-Page Cover Grid"
          >
            <LayoutGrid className="w-3 h-3" /> Cover Grid
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all ${
              viewMode === 'list'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Compact List View"
          >
            <List className="w-3 h-3" /> List
          </button>
        </div>
      </div>

      {/* View 1: Interactive First-Page Cover Grid with Drag and Drop */}
      {viewMode === 'grid' && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={files.map((f) => f.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
              {files.map((file, idx) => (
                <SortableDocCard
                  key={file.id}
                  file={file}
                  index={idx}
                  totalFiles={files.length}
                  meta={docMetaMap[file.id]}
                  onMove={onMoveFile}
                  onRemove={onRemoveFile}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* View 2: Compact List View */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {files.map((file, idx) => {
            const meta = docMetaMap[file.id];
            return (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/60 rounded-xl transition-all"
              >
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="w-7 h-7 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    #{idx + 1}
                  </div>
                  {meta?.thumbnail && (
                    <div className="w-8 h-10 rounded bg-slate-950 border border-slate-800 overflow-hidden flex-shrink-0">
                      <img src={meta.thumbnail} alt="" className="w-full h-full object-contain" />
                    </div>
                  )}
                  <div className="truncate">
                    <div className="text-xs font-semibold text-slate-100 truncate">{file.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {meta?.pageCount ? `${meta.pageCount} pages` : 'PDF'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 flex-shrink-0 ml-3">
                  <button
                    onClick={() => onMoveFile(idx, idx - 1)}
                    disabled={idx === 0}
                    className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-brand-600 disabled:opacity-25 text-slate-200 hover:text-white transition-colors"
                    title="Move Up"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 rotate-90" />
                  </button>
                  <button
                    onClick={() => onMoveFile(idx, idx + 1)}
                    disabled={idx === files.length - 1}
                    className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-brand-600 disabled:opacity-25 text-slate-200 hover:text-white transition-colors"
                    title="Move Down"
                  >
                    <ArrowRight className="w-3.5 h-3.5 rotate-90" />
                  </button>
                  <button
                    onClick={() => onRemoveFile(file.id)}
                    className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-red-600 text-slate-300 hover:text-white transition-colors ml-1"
                    title="Remove File"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Live Merge Pipeline Sequence Indicator */}
      {files.length > 1 && (
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center flex-wrap gap-2">
          <span className="font-semibold text-brand-400 text-[11px] flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" /> Resulting Merge Pipeline:
          </span>
          {files.map((f, i) => {
            const count = docMetaMap[f.id]?.pageCount;
            return (
              <React.Fragment key={f.id}>
                <span className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-200 font-mono text-[11px] truncate max-w-[180px] border border-slate-700/50">
                  #{i + 1} {f.name} {count ? `(${count}p)` : ''}
                </span>
                {i < files.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-brand-400 flex-shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};
