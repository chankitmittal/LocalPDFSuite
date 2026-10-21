import React, { useState } from 'react';
import { useAppStore, showToast } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import { FileText, FileSpreadsheet, Presentation, FileUp, Download, CheckCircle, AlertCircle } from 'lucide-react';

export const OfficeConvertPanel: React.FC = () => {
  const { selectedFile, currentJob, systemStatus } = useAppStore();
  const { callApi, triggerDownload } = useSidecar();

  const [convertType, setConvertType] = useState<'to_word' | 'to_excel' | 'to_powerpoint' | 'to_pdf'>('to_word');

  const handleConvert = async () => {
    if (!selectedFile) {
      showToast('Please upload and select a document first.', 'warning');
      return;
    }

    if (convertType === 'to_word') {
      await callApi('/api/office/pdf-to-word', {
        file_path: selectedFile.path,
      });
    } else if (convertType === 'to_excel') {
      await callApi('/api/office/pdf-to-excel', {
        file_path: selectedFile.path,
      });
    } else if (convertType === 'to_powerpoint') {
      await callApi('/api/office/pdf-to-powerpoint', {
        file_path: selectedFile.path,
      });
    } else if (convertType === 'to_pdf') {
      await callApi('/api/office/office-to-pdf', {
        file_path: selectedFile.path,
        custom_soffice_path: systemStatus.libreofficePath,
      });
    }
  };

  const isOfficeInput = selectedFile && !selectedFile.name.toLowerCase().endsWith('.pdf');

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-brand-400" />
          Document & Office Conversions
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Convert PDF to editable Word, multi-sheet Excel, and PowerPoint slides, or convert Office docs to PDF.
        </p>
      </div>

      {/* Conversion Type Selectors */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button
          onClick={() => setConvertType('to_word')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            convertType === 'to_word'
              ? 'border-brand-500 bg-brand-500/10 text-white'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-5 h-5 text-blue-400 mb-1.5" />
          <div className="font-semibold text-xs text-slate-200">PDF to Word</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Editable .docx</div>
        </button>

        <button
          onClick={() => setConvertType('to_excel')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            convertType === 'to_excel'
              ? 'border-brand-500 bg-brand-500/10 text-white'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-5 h-5 text-emerald-400 mb-1.5" />
          <div className="font-semibold text-xs text-slate-200">PDF to Excel</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Multi-sheet .xlsx</div>
        </button>

        <button
          onClick={() => setConvertType('to_powerpoint')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            convertType === 'to_powerpoint'
              ? 'border-brand-500 bg-brand-500/10 text-white'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Presentation className="w-5 h-5 text-amber-400 mb-1.5" />
          <div className="font-semibold text-xs text-slate-200">PDF to PPTX</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Slide deck .pptx</div>
        </button>

        <button
          onClick={() => setConvertType('to_pdf')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            convertType === 'to_pdf'
              ? 'border-brand-500 bg-brand-500/10 text-white'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileUp className="w-5 h-5 text-purple-400 mb-1.5" />
          <div className="font-semibold text-xs text-slate-200">Office to PDF</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Word/Excel/PPT to PDF</div>
        </button>
      </div>

      {convertType === 'to_pdf' && !systemStatus.libreofficeInstalled && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
          LibreOffice binary was not auto-detected. You can install LibreOffice or set its portable path in Settings.
        </div>
      )}

      <button
        onClick={handleConvert}
        disabled={!selectedFile || currentJob.status === 'running'}
        className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
      >
        <FileSpreadsheet className="w-4 h-4" />
        {currentJob.status === 'running'
          ? 'Converting Document...'
          : convertType === 'to_word'
          ? 'Convert to Word (.docx)'
          : convertType === 'to_excel'
          ? 'Extract to Excel (.xlsx)'
          : convertType === 'to_powerpoint'
          ? 'Convert to PowerPoint (.pptx)'
          : 'Convert Office Document to PDF'}
      </button>

      {/* Result feedback */}
      {currentJob.status === 'success' && currentJob.downloadUrl && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-emerald-400 text-xs">
            <CheckCircle className="w-4 h-4" />
            <span className="font-medium">{currentJob.message}</span>
          </div>
          <button
            onClick={() => triggerDownload(currentJob.downloadUrl!)}
            className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Save Converted File
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
