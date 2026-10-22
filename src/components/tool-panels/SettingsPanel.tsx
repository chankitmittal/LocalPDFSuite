import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { callSidecarEndpoint } from '../../hooks/useSidecar';
import { Settings, FolderCheck, ShieldCheck, RefreshCw, ExternalLink, CheckCircle } from 'lucide-react';

interface LicenseItem {
  Name: string;
  Version: string;
  License: string;
}

export const SettingsPanel: React.FC = () => {
  const { systemStatus, setSystemStatus } = useAppStore();

  const [sofficeInput, setSofficeInput] = useState(systemStatus.libreofficePath || '');
  const [tessInput, setTessInput] = useState(systemStatus.tesseractPath || '');
  const [licenses, setLicenses] = useState<LicenseItem[]>([]);
  const [loadingLicenses, setLoadingLicenses] = useState(false);
  const [filterLicense, setFilterLicense] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const fetchLicenses = async () => {
    setLoadingLicenses(true);
    try {
      const data = await callSidecarEndpoint('/api/licenses');
      if (Array.isArray(data)) {
        setLicenses(data);
      }
    } catch (e) {
      console.warn('Failed to load license notices from sidecar:', e);
    } finally {
      setLoadingLicenses(false);
    }
  };

  useEffect(() => {
    fetchLicenses();
  }, []);

  const handleSavePaths = () => {
    setSystemStatus({
      libreofficePath: sofficeInput,
      tesseractPath: tessInput,
    });
    setSaveStatus('Settings saved to local storage.');
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const filtered = licenses.filter(
    (l) =>
      l.Name.toLowerCase().includes(filterLicense.toLowerCase()) ||
      l.License.toLowerCase().includes(filterLicense.toLowerCase())
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-8">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-brand-400" />
          Offline Module Manager & License Compliance
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure external binary paths (LibreOffice & Tesseract) and audit permissive third-party open-source licenses.
        </p>
      </div>

      {/* Module Paths */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <FolderCheck className="w-4 h-4 text-emerald-400" />
          Modular Offline Plugin Configuration
        </h3>

        <div className="grid grid-cols-1 gap-4">
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200">
                LibreOffice Executable Path (soffice / soffice.exe)
              </label>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  systemStatus.libreofficeInstalled
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {systemStatus.libreofficeInstalled ? 'Detected' : 'Not Detected'}
              </span>
            </div>
            <input
              type="text"
              value={sofficeInput}
              onChange={(e) => setSofficeInput(e.target.value)}
              placeholder="e.g. C:\Program Files\LibreOffice\program\soffice.exe"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200">
                Tesseract OCR Executable Path (tesseract / tesseract.exe)
              </label>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  systemStatus.tesseractInstalled
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {systemStatus.tesseractInstalled ? 'Detected' : 'Not Detected'}
              </span>
            </div>
            <input
              type="text"
              value={tessInput}
              onChange={(e) => setTessInput(e.target.value)}
              placeholder="e.g. C:\Program Files\Tesseract-OCR\tesseract.exe"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSavePaths}
            className="py-2 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-colors"
          >
            Save Custom Paths
          </button>
          {saveStatus && (
            <span className="text-xs text-emerald-400 flex items-center gap-1.5 animate-fadeIn">
              <CheckCircle className="w-3.5 h-3.5" />
              {saveStatus}
            </span>
          )}
        </div>
      </div>

      {/* Third Party Open Source Notices */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand-400" />
              Open Source Compliance & Third-Party Notices
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Strictly vetted permissive & weak-copyleft packages (MIT, Apache-2.0, BSD, MPL-2.0). ZERO GPL/AGPL.
            </p>
          </div>

          <button
            onClick={fetchLicenses}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white transition-colors"
            title="Refresh License Audit"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingLicenses ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <input
          type="text"
          value={filterLicense}
          onChange={(e) => setFilterLicense(e.target.value)}
          placeholder="Filter licenses (e.g. MIT, pikepdf, pypdfium2)..."
          className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
        />

        <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/80 text-xs">
          {filtered.map((item, idx) => (
            <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-900/50">
              <div>
                <span className="font-semibold text-slate-200">{item.Name}</span>
                <span className="text-[10px] text-slate-500 ml-2 font-mono">v{item.Version}</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 font-mono text-[10px] border border-brand-500/20">
                {item.License}
              </span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="p-6 text-center text-slate-500 text-xs">No matching packages found.</div>
          )}
        </div>
      </div>
    </div>
  );
};
