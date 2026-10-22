import React, { useState, useEffect, useRef } from 'react';
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
  ChevronDown,
  LayoutList,
  Check,
  X,
} from 'lucide-react';

interface ToolItem {
  id: ToolType;
  label: string;
  icon: React.ElementType;
  description: string;
}

interface CategoryGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  tools: ToolItem[];
}

const CATEGORIES: CategoryGroup[] = [
  {
    id: 'organize',
    label: 'Organize',
    icon: LayoutGrid,
    tools: [
      { id: 'merge', label: 'Merge', icon: Layers, description: 'Combine multiple PDF files into one' },
      { id: 'split', label: 'Split', icon: Scissors, description: 'Extract pages or split into ranges' },
      { id: 'organize', label: 'Organize', icon: LayoutGrid, description: 'Reorder, rotate, or delete pages' },
      { id: 'compress', label: 'Compress', icon: Minimize2, description: 'Optimize and reduce file size' },
    ],
  },
  {
    id: 'edit-forms',
    label: 'Edit & Forms',
    icon: Edit3,
    tools: [
      { id: 'edit', label: 'Edit PDF', icon: Edit3, description: 'Add text, shapes, whiteout, and images' },
      { id: 'prepare-form', label: 'Prepare Form', icon: FormInput, description: 'Design fillable interactive forms' },
      { id: 'form-fill', label: 'Fill Form', icon: FileEdit, description: 'Fill and flatten PDF form fields' },
      { id: 'watermark', label: 'Watermark', icon: Stamp, description: 'Add stamps, watermarks, or page numbers' },
      { id: 'bates', label: 'Bates Stamping', icon: Hash, description: 'Litigation numbering & index generation' },
    ],
  },
  {
    id: 'security-review',
    label: 'Security & Review',
    icon: Shield,
    tools: [
      { id: 'redact', label: 'Redact', icon: EyeOff, description: 'Permanently blackout sensitive data' },
      { id: 'sign', label: 'Sign', icon: PenTool, description: 'Draw signature ink & digital certificates' },
      { id: 'sanitize', label: 'Sanitize', icon: ShieldCheck, description: 'Purge hidden metadata & scripts' },
      { id: 'compare', label: 'Compare', icon: GitCompare, description: 'Side-by-side visual diff analysis' },
      { id: 'security', label: 'Security', icon: Lock, description: 'Password encryption & permissions' },
    ],
  },
  {
    id: 'convert-tools',
    label: 'Convert & Utilities',
    icon: Workflow,
    tools: [
      { id: 'office', label: 'Office to PDF', icon: FileSpreadsheet, description: 'Convert Word, Excel, and PowerPoint' },
      { id: 'images', label: 'Image Suite', icon: ImageIcon, description: 'Convert PDF to images & bulk transform' },
      { id: 'ocr', label: 'OCR Engine', icon: ScanText, description: 'Generate searchable text sandwiches' },
      { id: 'pipeline', label: 'Action Wizard', icon: Workflow, description: 'Batch automation workflow pipelines' },
    ],
  },
];

export const Navbar: React.FC = () => {
  const { activeTool, setActiveTool, systemStatus } = useAppStore();
  const [activeCategory, setActiveCategory] = useState<string>('organize');
  const [showAllTools, setShowAllTools] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync category with active tool
  useEffect(() => {
    if (activeTool === 'settings') return;
    const cat = CATEGORIES.find((c) => c.tools.some((t) => t.id === activeTool));
    if (cat && cat.id !== activeCategory) {
      setActiveCategory(cat.id);
    }
  }, [activeTool]);

  // Click outside listener for All Tools dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAllTools(false);
      }
    };
    if (showAllTools) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAllTools]);

  const handleCategoryClick = (cat: CategoryGroup) => {
    setActiveCategory(cat.id);
    // If current tool is not in this category, activate the first tool of this category
    const hasCurrentTool = cat.tools.some((t) => t.id === activeTool);
    if (!hasCurrentTool && cat.tools.length > 0) {
      setActiveTool(cat.tools[0].id);
    }
  };

  const handleToolSelect = (toolId: ToolType) => {
    setActiveTool(toolId);
    setShowAllTools(false);
  };

  const currentCategoryObj = CATEGORIES.find((c) => c.id === activeCategory) || CATEGORIES[0];

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 shadow-lg">
      {/* 1. Top Brand & Engine Bar */}
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div
          className="flex items-center space-x-3 cursor-pointer group"
          onClick={() => setActiveTool('merge')}
          title="Return to Home (Merge)"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-500/20 group-hover:scale-105 transition-transform">
            <span className="text-white font-extrabold text-xl tracking-wider">LP</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              LocalPDF Suite
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> 100% Offline
              </span>
            </h1>
            <p className="text-xs text-slate-400">Offline Document & PDF Utility Suite</p>
          </div>
        </div>

        {/* Plugin indicators & Settings */}
        <div className="flex items-center space-x-3 text-xs">
          <div
            className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 cursor-default transition-colors ${
              systemStatus.libreofficeInstalled
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
            title={systemStatus.libreofficePath || 'LibreOffice not detected in standard paths'}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                systemStatus.libreofficeInstalled ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            LibreOffice
          </div>

          <div
            className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 cursor-default transition-colors ${
              systemStatus.tesseractInstalled
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
            title={systemStatus.tesseractPath || 'Tesseract OCR not detected in standard paths'}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                systemStatus.tesseractInstalled ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            Tesseract OCR
          </div>

          <button
            onClick={() => setActiveTool('settings')}
            className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 font-medium transition-all ${
              activeTool === 'settings'
                ? 'bg-brand-600 text-white border-brand-500 shadow-md shadow-brand-500/20'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/80'
            }`}
            title="Module Manager & License Compliance"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* 2. Structured Two-Tier Navigation Toolbar */}
      <div className="border-t border-slate-800/80 bg-slate-900/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4">
          {/* Row 1: Logical Category Tabs & "All Tools" Launcher */}
          <div className="flex items-center justify-between border-b border-slate-800/60 py-1.5">
            <nav className="flex items-center gap-1 sm:gap-2" aria-label="Tool Categories">
              {CATEGORIES.map((cat) => {
                const CatIcon = cat.icon;
                const isCatActive = activeCategory === cat.id && activeTool !== 'settings';
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isCatActive
                        ? 'bg-brand-500/15 text-brand-300 border border-brand-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <CatIcon className="w-3.5 h-3.5" />
                    <span>{cat.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isCatActive
                          ? 'bg-brand-500/30 text-brand-200'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {cat.tools.length}
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* All Tools Dropdown Toggle */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowAllTools(!showAllTools)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  showAllTools
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
                title="Browse all 18 tools by category"
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">All Tools</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    showAllTools ? 'rotate-180 text-brand-400' : ''
                  }`}
                />
              </button>

              {/* All Tools Mega Popover */}
              {showAllTools && (
                <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <LayoutList className="w-4 h-4 text-brand-400" />
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                        All LocalPDF Suite Tools
                      </h3>
                    </div>
                    <button
                      onClick={() => setShowAllTools(false)}
                      className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {CATEGORIES.map((cat) => (
                      <div key={cat.id} className="space-y-2">
                        <div className="text-[11px] font-bold text-brand-400 flex items-center gap-1.5 pb-1 border-b border-slate-800/60">
                          <cat.icon className="w-3.5 h-3.5" />
                          <span>{cat.label}</span>
                        </div>
                        <div className="space-y-1">
                          {cat.tools.map((t) => {
                            const TIcon = t.icon;
                            const isSelected = activeTool === t.id;
                            return (
                              <button
                                key={t.id}
                                onClick={() => handleToolSelect(t.id)}
                                className={`w-full text-left p-2 rounded-lg transition-all flex items-start gap-2.5 ${
                                  isSelected
                                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/40'
                                    : 'hover:bg-slate-800/80 text-slate-300 hover:text-white'
                                }`}
                              >
                                <TIcon className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                                    {t.label}
                                    {isSelected && <Check className="w-3 h-3 text-brand-400" />}
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">
                                    {t.description}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Active Category Tools Strip (Clean, Spacious, No Horizontal Scrolling) */}
          <div className="py-2 flex items-center flex-wrap gap-1.5">
            {currentCategoryObj.tools.map((t) => {
              const Icon = t.icon;
              const isActive = activeTool === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTool(t.id)}
                  title={t.description}
                  className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
};
