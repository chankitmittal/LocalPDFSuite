import React, { useState } from 'react';
import { useAppStore, showToast } from '../../store/useAppStore';
import { useSidecar } from '../../hooks/useSidecar';
import { Lock, Unlock, Wrench, Download, CheckCircle, AlertCircle } from 'lucide-react';

export const SecurityPanel: React.FC = () => {
  const { selectedFile, currentJob } = useAppStore();
  const { callApi, triggerDownload } = useSidecar();

  const [mode, setMode] = useState<'protect' | 'unlock' | 'repair'>('protect');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleAction = async () => {
    if (!selectedFile) {
      showToast('Please upload and select a PDF file first.', 'warning');
      return;
    }

    if (mode === 'protect') {
      if (!password) {
        showToast('Please enter a password.', 'warning');
        return;
      }
      if (password !== confirmPassword) {
        showToast('Passwords do not match.', 'warning');
        return;
      }
      await callApi('/api/structural/protect', {
        file_path: selectedFile.path,
        user_password: password,
        output_filename: `protected_${selectedFile.name}`,
      });
    } else if (mode === 'unlock') {
      if (!password) {
        showToast('Please enter the current document password.', 'warning');
        return;
      }
      await callApi('/api/structural/unlock', {
        file_path: selectedFile.path,
        password,
        output_filename: `unlocked_${selectedFile.name}`,
      });
    } else if (mode === 'repair') {
      await callApi('/api/structural/repair', {
        file_path: selectedFile.path,
        output_filename: `repaired_${selectedFile.name}`,
      });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Lock className="w-5 h-5 text-brand-400" />
          Security, Password & PDF Repair
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Apply military-grade AES-256 encryption, decrypt files, or recover damaged xref tables.
        </p>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setMode('protect')}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            mode === 'protect'
              ? 'border-brand-500 bg-brand-500/10 text-white'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Lock className="w-3.5 h-3.5" /> Protect (AES-256)
        </button>

        <button
          onClick={() => setMode('unlock')}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            mode === 'unlock'
              ? 'border-brand-500 bg-brand-500/10 text-white'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Unlock className="w-3.5 h-3.5" /> Unlock PDF
        </button>

        <button
          onClick={() => setMode('repair')}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            mode === 'repair'
              ? 'border-brand-500 bg-brand-500/10 text-white'
              : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" /> Repair PDF
        </button>
      </div>

      {/* Form Inputs */}
      {mode === 'protect' && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-300">Set User Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter strong encryption password"
              className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-300">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>
      )}

      {mode === 'unlock' && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-300">Document Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password to unlock"
              className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>
      )}

      {mode === 'repair' && (
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 text-xs text-slate-300">
          <p className="font-semibold text-slate-200 mb-1">QPDF Cross-Reference Table Reconstruction</p>
          <p className="text-slate-400">
            Fixes unreadable PDF streams, corrupted EOF markers, and repairs broken cross-reference offsets without altering document content.
          </p>
        </div>
      )}

      <button
        onClick={handleAction}
        disabled={!selectedFile || currentJob.status === 'running'}
        className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
      >
        {mode === 'protect' && <Lock className="w-4 h-4" />}
        {mode === 'unlock' && <Unlock className="w-4 h-4" />}
        {mode === 'repair' && <Wrench className="w-4 h-4" />}
        {currentJob.status === 'running'
          ? 'Processing...'
          : mode === 'protect'
          ? 'Encrypt with AES-256'
          : mode === 'unlock'
          ? 'Remove Password & Save'
          : 'Rebuild & Repair PDF'}
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
            <Download className="w-3.5 h-3.5" /> Save File
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
