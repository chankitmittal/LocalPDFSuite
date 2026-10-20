export type ToolType =
  | 'merge'
  | 'split'
  | 'edit'
  | 'organize'
  | 'compress'
  | 'security'
  | 'watermark'
  | 'page-numbers'
  | 'redact'
  | 'sign'
  | 'form-fill'
  | 'office'
  | 'images'
  | 'ocr'
  | 'settings';

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  path: string;
  fileObj?: File;
}

export interface PageItem {
  id: string;
  pageIndex: number;      // 0-based
  pageNumber: number;     // 1-based
  rotation: number;       // 0, 90, 180, 270
  deleted: boolean;
  thumbnail?: string;     // Data URL / Canvas image
}

export interface RedactionBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OutputFileItem {
  name: string;
  path: string;
  size?: number;
  downloadUrl: string;
}

export interface JobState {
  status: 'idle' | 'running' | 'success' | 'error';
  message?: string;
  outputPath?: string;
  downloadUrl?: string;
  zipDownloadUrl?: string;
  outputFiles?: OutputFileItem[];
  error?: string;
  details?: any;
}

export interface PdfEditItem {
  id: string;
  pageNumber: number;
  type: 'text' | 'text_replacement' | 'whiteout' | 'image' | 'highlight' | 'shape';
  canvasX: number;
  canvasY: number;
  canvasWidth: number;
  canvasHeight: number;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  baselineY?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  hexColor?: string;
  bold?: boolean;
  italic?: boolean;
  opacity?: number;
  originalText?: string;
  backgroundPatch?: {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
  };
  imageData?: string;
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
}
