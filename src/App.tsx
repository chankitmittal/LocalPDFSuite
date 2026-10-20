import React from 'react';
import { useAppStore } from './store/useAppStore';
import { Navbar } from './components/Navbar';
import { FileDropzone } from './components/dropzone/FileDropzone';
import { PdfCanvas } from './components/pdf-canvas/PdfCanvas';
import { MergeSplitPanel } from './components/tool-panels/MergeSplitPanel';
import { EditPdfPanel } from './components/tool-panels/EditPdfPanel';
import { OrganizePanel } from './components/tool-panels/OrganizePanel';
import { CompressPanel } from './components/tool-panels/CompressPanel';
import { SecurityPanel } from './components/tool-panels/SecurityPanel';
import { WatermarkPanel } from './components/tool-panels/WatermarkPanel';
import { RedactionPanel } from './components/tool-panels/RedactionPanel';
import { SignPanel } from './components/tool-panels/SignPanel';
import { FormFillPanel } from './components/tool-panels/FormFillPanel';
import { OfficeConvertPanel } from './components/tool-panels/OfficeConvertPanel';
import { ImageSuitePanel } from './components/tool-panels/ImageSuitePanel';
import { OcrPanel } from './components/tool-panels/OcrPanel';
import { SettingsPanel } from './components/tool-panels/SettingsPanel';

export const App: React.FC = () => {
  const { activeTool, selectedFile } = useAppStore();

  const renderActiveToolPanel = () => {
    switch (activeTool) {
      case 'merge':
      case 'split':
        return <MergeSplitPanel />;
      case 'edit':
        return <EditPdfPanel />;
      case 'organize':
        return <OrganizePanel />;
      case 'compress':
        return <CompressPanel />;
      case 'security':
        return <SecurityPanel />;
      case 'watermark':
      case 'page-numbers':
        return <WatermarkPanel />;
      case 'redact':
        return <RedactionPanel />;
      case 'sign':
        return <SignPanel />;
      case 'form-fill':
        return <FormFillPanel />;
      case 'office':
        return <OfficeConvertPanel />;
      case 'images':
        return <ImageSuitePanel />;
      case 'ocr':
        return <OcrPanel />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <MergeSplitPanel />;
    }
  };

  const showCanvas =
    selectedFile &&
    selectedFile.name.toLowerCase().endsWith('.pdf') &&
    ['organize', 'redact', 'sign'].includes(activeTool);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 space-y-8">
        {/* Dropzone is present for all tools except settings */}
        {activeTool !== 'settings' && <FileDropzone />}

        {/* Interactive PDF Page Canvas (Thumbnail reordering, rotating, deleting) */}
        {showCanvas && <PdfCanvas />}

        {/* Feature Specific Control Sidebar / Panel */}
        <div className="w-full">{renderActiveToolPanel()}</div>
      </main>

      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        LocalPDF Suite &bull; 100% Offline Desktop Processing &bull; Zero External API Calls
      </footer>
    </div>
  );
};

export default App;
