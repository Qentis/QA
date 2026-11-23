import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastItem } from '../types';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-14 right-3 left-3 z-50 mx-auto flex max-w-md flex-col gap-2 lg:top-4 lg:right-4 lg:left-auto lg:w-96"
    >
      {toasts.map((toast) => {
        const Icon =
          toast.type === 'success'
            ? CheckCircle2
            : toast.type === 'error'
              ? AlertCircle
              : Info;
        const iconColor =
          toast.type === 'success'
            ? 'text-emerald-400'
            : toast.type === 'error'
              ? 'text-red-400'
              : 'text-[#3B82F6]';
        const borderColor =
          toast.type === 'error'
            ? 'border-red-500/30'
            : toast.type === 'success'
              ? 'border-emerald-500/25'
              : 'border-white/10';

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border ${borderColor} bg-[#1E1E1E]/95 p-3.5 shadow-xl shadow-black/40 backdrop-blur-md transition-all duration-200`}
          >
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#F4F4F5]">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-400 break-words">
                  {toast.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Закрыть уведомление"
              className="-m-1.5 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
