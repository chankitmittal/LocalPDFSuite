import { create } from 'zustand';
import { ToolType, UploadedFile, PageItem, JobState } from '../types';

interface AppStore {
  activeTool: ToolType;
  files: UploadedFile[];
  selectedFile: UploadedFile | null;
  pages: PageItem[];
  currentJob: JobState;
  systemStatus: {
    libreofficeInstalled: boolean;
    tesseractInstalled: boolean;
    libreofficePath?: string;
    tesseractPath?: string;
  };

  setActiveTool: (tool: ToolType) => void;
  setFiles: (files: UploadedFile[]) => void;
  addFiles: (newFiles: UploadedFile[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  setSelectedFile: (file: UploadedFile | null) => void;
  setPages: (pages: PageItem[]) => void;
  updatePage: (id: string, updates: Partial<PageItem>) => void;
  reorderPages: (pages: PageItem[]) => void;
  reorderFiles: (files: UploadedFile[]) => void;
  moveFile: (fromIndex: number, toIndex: number) => void;
  setJob: (job: JobState) => void;
  resetJob: () => void;
  setSystemStatus: (status: Partial<AppStore['systemStatus']>) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeTool: 'merge',
  files: [],
  selectedFile: null,
  pages: [],
  currentJob: { status: 'idle' },
  systemStatus: {
    libreofficeInstalled: false,
    tesseractInstalled: false,
  },

  setActiveTool: (tool) => set({ activeTool: tool, currentJob: { status: 'idle' } }),
  setFiles: (files) => set({ files, selectedFile: files[0] || null }),
  addFiles: (newFiles) =>
    set((state) => {
      const merged = [...state.files, ...newFiles];
      return { files: merged, selectedFile: state.selectedFile || merged[0] || null };
    }),
  removeFile: (id) =>
    set((state) => {
      const filtered = state.files.filter((f) => f.id !== id);
      return {
        files: filtered,
        selectedFile: state.selectedFile?.id === id ? filtered[0] || null : state.selectedFile,
      };
    }),
  clearFiles: () => set({ files: [], selectedFile: null, pages: [], currentJob: { status: 'idle' } }),
  setSelectedFile: (file) => set({ selectedFile: file, pages: [], currentJob: { status: 'idle' } }),
  setPages: (pages) => set({ pages }),
  updatePage: (id, updates) =>
    set((state) => ({
      pages: state.pages.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),
  reorderPages: (pages) => set({ pages }),
  reorderFiles: (files) => set({ files }),
  moveFile: (fromIndex, toIndex) =>
    set((state) => {
      if (
        fromIndex < 0 ||
        fromIndex >= state.files.length ||
        toIndex < 0 ||
        toIndex >= state.files.length
      ) {
        return state;
      }
      const newFiles = [...state.files];
      const [moved] = newFiles.splice(fromIndex, 1);
      newFiles.splice(toIndex, 0, moved);
      return { files: newFiles };
    }),
  setJob: (currentJob) => set({ currentJob }),
  resetJob: () => set({ currentJob: { status: 'idle' } }),
  setSystemStatus: (status) =>
    set((state) => ({
      systemStatus: { ...state.systemStatus, ...status },
    })),
}));
