import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { ToolType } from '../types';
import {
  Layers,
  Scissors,
  LayoutGrid,
  Minimize2,
  Lock,
  Stamp,
  EyeOff,
  PenTool,
  Edit3,
  GitCompare,
  Hash,
  Shield,
  Workflow,
  FormInput,
  FileEdit,
  FileSpreadsheet,
  Image as ImageIcon,
  ScanText,
  Settings,
  ShieldCheck,
} from 'lucide-react';

interface ToolItem {
  id: ToolType;
  label: string;
  icon: React.ElementType;
}

const TOOLS: ToolItem[] = [
  { id: 'merge', label: 'Merge', icon: Layers },
  { id: 'split', label: 'Split', icon: Scissors },
  { id: 'edit', label: 'Edit PDF', icon: Edit3 },
  { id: 'compare', label: 'Compare', icon: GitCompare },
  { id: 'bates', label: 'Bates', icon: Hash },
  { id: 'sanitize', label: 'Sanitize', icon: Shield },
  { id: 'pipeline', label: 'Wizard', icon: Workflow },
  { id: 'organize', label: 'Organize', icon: LayoutGrid },
  { id: 'compress', label: 'Compress', icon: Minimize2 },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'watermark', label: 'Watermark', icon: Stamp },
  { id: 'redact', label: 'Redact', icon: EyeOff },
  { id: 'sign', label: 'Sign', icon: PenTool },
  { id: 'prepare-form', label: 'Prepare Form', icon: FormInput },
  { id: 'form-fill', label: 'Fill Form', icon: FileEdit },
  { id: 'office', label: 'Office', icon: FileSpreadsheet },
  { id: 'images', label: 'Images', icon: ImageIcon },
  { id: 'ocr', label: 'OCR', icon: ScanText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Navbar: React.FC = () => {
  const { activeTool, setActiveTool, systemStatus } = useAppStore();

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
      {/* Top Bar */}
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTool('merge')}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <span className="text-white font-extrabold text-xl tracking-wider">LP</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              LocalPDF Suite
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> 100% Offline
              </span>
            </h1>
            <p className="text-xs text-slate-400">Offline iLovePDF & iLoveIMG Workstation</p>
          </div>
        </div>

        {/* Plugin indicators & Settings */}
        <div className="flex items-center space-x-3 text-xs">
          <div
            className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
              systemStatus.libreofficeInstalled
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
            title={systemStatus.libreofficePath || 'LibreOffice not detected in standard paths'}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${systemStatus.libreofficeInstalled ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            LibreOffice
          </div>

          <div
            className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
              systemStatus.tesseractInstalled
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
            title={systemStatus.tesseractPath || 'Tesseract OCR not detected in standard paths'}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${systemStatus.tesseractInstalled ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            Tesseract OCR
          </div>
        </div>
      </div>

      {/* Tools Nav Tabs */}
      <div className="border-t border-slate-800/80 bg-slate-900/60 overflow-x-auto no-scrollbar">
        <div className="max-w-7xl mx-auto px-4 flex space-x-1 py-1.5">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            const isActive = activeTool === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTool(t.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
