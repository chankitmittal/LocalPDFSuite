import { create } from 'zustand';
import { ToolType, UploadedFile, PageItem, JobState } from '../types';

export interface ToastNotification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
}

interface AppStore {
  activeTool: ToolType;
  files: UploadedFile[];
  selectedFile: UploadedFile | null;
  pages: PageItem[];
  currentJob: JobState;
  sidecarPort: number;
  sessionToken: string | null;
  toasts: ToastNotification[];
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
  setSidecarPort: (port: number) => void;
  setSessionToken: (token: string | null) => void;
  addToast: (message: string, type?: ToastNotification['type']) => void;
  removeToast: (id: string) => void;
  setSystemStatus: (status: Partial<AppStore['systemStatus']>) => void;
}

const savedSettings = (() => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('localpdf_settings') : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
})();

export const useAppStore = create<AppStore>((set) => ({
  activeTool: 'merge',
  files: [],
  selectedFile: null,
  pages: [],
  currentJob: { status: 'idle' },
  sidecarPort: 8765,
  sessionToken: null,
  toasts: [],
  systemStatus: {
    libreofficeInstalled: false,
    tesseractInstalled: false,
    libreofficePath: savedSettings.libreofficePath || undefined,
    tesseractPath: savedSettings.tesseractPath || undefined,
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
  setSidecarPort: (sidecarPort) => set({ sidecarPort }),
  setSessionToken: (sessionToken) => set({ sessionToken }),
  addToast: (message, type = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      toasts: [...state.toasts, { id, type, message }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 4500);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  setSystemStatus: (status) =>
    set((state) => {
      const nextStatus = { ...state.systemStatus, ...status };
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(
            'localpdf_settings',
            JSON.stringify({
              libreofficePath: nextStatus.libreofficePath,
              tesseractPath: nextStatus.tesseractPath,
            })
          );
        }
      } catch (e) {
        console.warn('Failed to persist settings:', e);
      }
      return { systemStatus: nextStatus };
    }),
}));

export const showToast = (message: string, type: ToastNotification['type'] = 'info') => {
  useAppStore.getState().addToast(message, type);
};
