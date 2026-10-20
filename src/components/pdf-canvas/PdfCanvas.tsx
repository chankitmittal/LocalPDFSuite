import React, { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
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
import { useAppStore } from '../../store/useAppStore';
import { PageItem } from '../../types';
import { RotateCw, Trash2, Undo2, GripVertical } from 'lucide-react';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

interface SortablePageProps {
  page: PageItem;
  onRotate: (id: string) => void;
  onToggleDelete: (id: string) => void;
}

const SortablePageItem: React.FC<SortablePageProps> = ({ page, onRotate, onToggleDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
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
      className={`relative group bg-slate-900 border rounded-xl p-3 flex flex-col items-center select-none transition-all ${
        isDragging
          ? 'opacity-80 scale-105 border-brand-500 shadow-xl'
          : page.deleted
          ? 'opacity-40 border-red-900/50 bg-red-950/20'
          : 'border-slate-800 hover:border-slate-700 hover:shadow-lg'
      }`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 p-1 rounded-md bg-slate-800/80 text-slate-400 hover:text-white cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        title="Drag to reorder"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {/* Action buttons */}
      <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRotate(page.id);
          }}
          className="p-1 rounded-md bg-slate-800/90 text-slate-300 hover:text-brand-400 hover:bg-slate-700 transition-colors"
          title="Rotate 90° Clockwise"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleDelete(page.id);
          }}
          className={`p-1 rounded-md bg-slate-800/90 transition-colors ${
            page.deleted
              ? 'text-emerald-400 hover:bg-emerald-950'
              : 'text-red-400 hover:text-red-300 hover:bg-slate-700'
          }`}
          title={page.deleted ? 'Restore Page' : 'Delete Page'}
        >
          {page.deleted ? <Undo2 className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Page thumbnail preview */}
      <div className="w-36 h-48 bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center border border-slate-800/50 my-1">
        {page.thumbnail ? (
          <img
            src={page.thumbnail}
            alt={`Page ${page.pageNumber}`}
            className="w-full h-full object-contain transition-transform duration-200"
            style={{ transform: `rotate(${page.rotation}deg)` }}
          />
        ) : (
          <div className="text-[10px] text-slate-500 font-mono">Rendering...</div>
        )}
      </div>

      {/* Page Badge */}
      <div className="flex items-center justify-between w-full mt-2 px-1 text-xs">
        <span className="font-semibold text-slate-400">Page {page.pageNumber}</span>
        {page.rotation > 0 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30">
            {page.rotation}°
          </span>
        )}
        {page.deleted && (
          <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 px-1 rounded">
            Deleted
          </span>
        )}
      </div>
    </div>
  );
};

export const PdfCanvas: React.FC = () => {
  const { selectedFile, pages, setPages, updatePage, reorderPages } = useAppStore();
  const [loading, setLoading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!selectedFile || !selectedFile.fileObj || !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      return;
    }

    let isCancelled = false;

    const loadPdfThumbnails = async () => {
      setLoading(true);
      try {
        const arrayBuffer = await selectedFile.fileObj!.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const total = pdf.numPages;

        const initialPages: PageItem[] = [];

        for (let i = 1; i <= total; i++) {
          if (isCancelled) return;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.35 });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d')!;
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context, viewport }).promise;
          const thumbnail = canvas.toDataURL('image/jpeg', 0.85);

          initialPages.push({
            id: `p_${i}_${Date.now()}`,
            pageIndex: i - 1,
            pageNumber: i,
            rotation: 0,
            deleted: false,
            thumbnail,
          });
        }

        if (!isCancelled) {
          setPages(initialPages);
        }
      } catch (err) {
        console.error('Failed to render PDF thumbnails with pdfjs-dist:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadPdfThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [selectedFile, setPages]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = pages.findIndex((p) => p.id === active.id);
      const newIndex = pages.findIndex((p) => p.id === over.id);
      reorderPages(arrayMove(pages, oldIndex, newIndex));
    }
  };

  const handleRotate = (id: string) => {
    const p = pages.find((item) => item.id === id);
    if (p) {
      updatePage(id, { rotation: (p.rotation + 90) % 360 });
    }
  };

  const handleToggleDelete = (id: string) => {
    const p = pages.find((item) => item.id === id);
    if (p) {
      updatePage(id, { deleted: !p.deleted });
    }
  };

  if (!selectedFile) {
    return null;
  }

  return (
    <div className="w-full bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-200">Interactive Page Organizer</h3>
          <p className="text-xs text-slate-400">
            Drag to reorder pages, rotate or delete pages before saving.
          </p>
        </div>

        {loading && (
          <div className="flex items-center space-x-2 text-xs text-brand-400">
            <div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            <span>Generating page previews...</span>
          </div>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {pages.map((page) => (
              <SortablePageItem
                key={page.id}
                page={page}
                onRotate={handleRotate}
                onToggleDelete={handleToggleDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};
