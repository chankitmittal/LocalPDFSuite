import React, { useState, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import { Upload, File as FileIcon, X, Trash2, CheckCircle2 } from 'lucide-react';

interface FileDropzoneProps {
  accept?: string;
  multiple?: boolean;
  title?: string;
  subtitle?: string;
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  accept = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx',
  multiple = true,
  title = 'Drag & drop files here, or browse',
  subtitle = 'Supports PDF, Images, Word, Excel, PowerPoint',
}) => {
  const { files, addFiles, removeFile, clearFiles, selectedFile, setSelectedFile } = useAppStore();
  const { uploadFile } = useSidecar();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);

    const newUploadedFiles = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const uploadRes = await uploadFile(file);
        newUploadedFiles.push({
          id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          size: file.size,
          path: uploadRes.path,
          fileObj: file,
        });
      } catch (err) {
        console.error('Failed to upload file to local sidecar:', err);
      }
    }

    if (newUploadedFiles.length > 0) {
      addFiles(newUploadedFiles);
    }
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="w-full space-y-4">
      {/* Drop area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-brand-500 bg-brand-500/10 scale-[1.01]'
            : 'border-slate-700 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-900'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-brand-400 group-hover:scale-110 transition-transform">
            {uploading ? (
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">{uploading ? 'Processing files...' : title}</p>
            <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
          </div>
        </div>
      </div>

      {/* Uploaded File List */}
      {files.length > 0 && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="font-medium text-slate-300">
              Selected Documents ({files.length})
            </span>
            <button
              onClick={clearFiles}
              className="text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear All
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {files.map((f) => {
              const isSelected = selectedFile?.id === f.id;
              return (
                <div
                  key={f.id}
                  onClick={() => setSelectedFile(f)}
                  className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? 'border-brand-500/80 bg-brand-500/10 text-white shadow-sm'
                      : 'border-slate-800 bg-slate-800/40 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 overflow-hidden">
                    <FileIcon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-brand-400' : 'text-slate-400'}`} />
                    <div className="truncate">
                      <p className="font-medium truncate">{f.name}</p>
                      <p className="text-[10px] text-slate-400">{formatSize(f.size)}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-400" />}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(f.id);
                      }}
                      className="p-1 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
