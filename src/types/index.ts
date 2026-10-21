export type ToolType =
  | 'merge'
  | 'split'
  | 'edit'
  | 'compare'
  | 'bates'
  | 'sanitize'
  | 'pipeline'
  | 'prepare-form'
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

export interface DiffEntry {
  type: 'insert' | 'delete' | 'replace';
  old_text?: string;
  new_text?: string;
  old_tokens?: { type: string; text: string }[];
  new_tokens?: { type: string; text: string }[];
  words_deleted: number;
  words_added: number;
}

export interface CompareChangeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ComparePageChange {
  id: string;
  page_number: number;
  type: 'replace' | 'delete' | 'insert' | 'graphic';
  old_text?: string;
  new_text?: string;
  box_a?: CompareChangeBox | null;
  box_b?: CompareChangeBox | null;
}

export interface ComparePageSummary {
  page_number: number;
  status: 'identical' | 'modified' | 'added' | 'deleted';
  has_visual_diff: boolean;
  diff_percentage: number;
  added_words_count: number;
  deleted_words_count: number;
  diff_entries: DiffEntry[];
  changes?: ComparePageChange[];
}

export interface CompareAnalysisResult {
  status: string;
  doc_a: {
    path: string;
    filename: string;
    page_count: number;
  };
  doc_b: {
    path: string;
    filename: string;
    page_count: number;
  };
  max_pages: number;
  identical_pages_count: number;
  modified_pages_count: number;
  added_pages_count: number;
  deleted_pages_count: number;
  total_changes: number;
  similarity_score: number;
  total_added_words: number;
  total_deleted_words: number;
  pages: ComparePageSummary[];
}

export interface ComparePageRenderResult {
  status: string;
  page_number: number;
  has_diff: boolean;
  diff_percentage: number;
  img_a?: string | null;
  img_b?: string | null;
  img_a_annotated?: string | null;
  img_b_annotated?: string | null;
  diff_img?: string | null;
  changes?: ComparePageChange[];
}

export interface BatesFileItem {
  name: string;
  path: string;
  size: number;
  start_bates: string;
  end_bates: string;
  pages_stamped: number;
  total_pages: number;
}

export interface BatesStampResult {
  status: string;
  output_files: string[];
  file_items: BatesFileItem[];
  index_csv_path?: string | null;
  zip_path?: string | null;
  total_documents: number;
  total_pages_stamped: number;
  start_bates: string;
  end_bates: string;
}

export interface FormSchemaField {
  field_name: string;
  type: string;
  documents_present: number;
  present_pct: number;
  populated_count: number;
  fill_rate_pct: number;
}

export interface BatchFormExportResult {
  status: string;
  total_documents: number;
  total_fields: number;
  headers: string[];
  metadata_column_count: number;
  schema: FormSchemaField[];
  preview_rows: string[][];
  total_rows: number;
  xlsx_path: string;
  xlsx_filename: string;
  xlsx_size: number;
  xlsx_url: string;
  csv_path: string;
  csv_filename: string;
  csv_size: number;
  csv_url: string;
}

export interface PrivacyReport {
  filename: string;
  file_size: number;
  page_count: number;
  has_metadata: boolean;
  metadata_items: Record<string, string>;
  has_xmp: boolean;
  xmp_size: number;
  has_javascript: boolean;
  javascript_count: number;
  has_attachments: boolean;
  embedded_files: Array<{ name: string }>;
  annotations_count: number;
  annotations_by_type: Record<string, number>;
  has_hidden_layers: boolean;
  has_actions: boolean;
  action_types: string[];
  has_bookmarks: boolean;
  bookmarks_count: number;
  threat_level: 'CLEAN' | 'MODERATE_EXPOSURE' | 'HIGH_EXPOSURE';
  threat_points: number;
  error?: string;
}

export interface SanitizeResult {
  status: string;
  original_size: number;
  sanitized_size: number;
  bytes_saved: number;
  items_stripped: string[];
  linearized: boolean;
  threat_level: string;
  output_filename: string;
  download_url: string;
  post_inspection?: PrivacyReport;
}

export interface BatchSanitizeResult {
  status: string;
  total_documents: number;
  successful_count: number;
  total_bytes_saved: number;
  results: Array<SanitizeResult & { filename: string }>;
  zip_filename: string;
  zip_url: string;
}

export interface PipelineStep {
  id?: string;
  type: 'compress' | 'watermark' | 'bates' | 'sanitize' | 'flatten' | 'protect';
  params: Record<string, any>;
}

export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  steps: PipelineStep[];
}

export interface PipelineFileLog {
  step_index: number;
  step_type: string;
  status: string;
  details: string;
}

export interface PipelineFileResult {
  status: string;
  filename: string;
  output_filename?: string;
  output_path?: string;
  download_url?: string;
  steps_executed?: number;
  step_logs?: PipelineFileLog[];
  original_size?: number;
  final_size?: number;
  error?: string;
}

export interface BatchPipelineResult {
  status: string;
  total_documents: number;
  successful_documents: number;
  results: PipelineFileResult[];
  zip_path?: string;
  zip_filename?: string;
  zip_url?: string;
}

export type BuilderFieldType =
  | 'text'
  | 'multiline'
  | 'checkbox'
  | 'choice'
  | 'signature'
  | 'button';

export interface FormBuilderField {
  id: string;
  name: string;
  type: BuilderFieldType;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rect?: [number, number, number, number];
  value?: string | boolean;
  options?: string[];
  required?: boolean;
  readonly?: boolean;
  tooltip?: string;
  font_size?: number;
}

export interface FormBuilderSaveResult {
  status: string;
  output_path: string;
  output_filename: string;
  download_url: string;
  total_fields: number;
  file_size: number;
}

