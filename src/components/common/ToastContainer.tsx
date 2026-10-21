import React from 'react';
import { useAppStore, ToastNotification } from '../../store/useAppStore';
import { Info, AlertTriangle, AlertCircle, CheckCircle2, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <aside aria-label="Notifications" className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t: ToastNotification) => {
        let bgClass = 'bg-slate-900 border-slate-700 text-slate-100';
        let IconComponent = Info;
        let iconColor = 'text-blue-400';

        if (t.type === 'warning') {
          bgClass = 'bg-amber-950/90 border-amber-800/80 text-amber-100';
          IconComponent = AlertTriangle;
          iconColor = 'text-amber-400';
        } else if (t.type === 'error') {
          bgClass = 'bg-rose-950/90 border-rose-800/80 text-rose-100';
          IconComponent = AlertCircle;
          iconColor = 'text-rose-400';
        } else if (t.type === 'success') {
          bgClass = 'bg-emerald-950/90 border-emerald-800/80 text-emerald-100';
          IconComponent = CheckCircle2;
          iconColor = 'text-emerald-400';
        }

        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${bgClass}`}
          >
            <IconComponent className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
            <div className="flex-1 text-sm font-medium leading-snug break-words">
              {t.message}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </aside>
  );
};
