// ============================================================================
// FeedbackContext — app-wide toasts + confirm dialogs.
//
// Replaces raw window.alert()/window.confirm() with UI that matches the
// dashboard theme:
//
//   const toast = useToast();            // toast.success('Saved'), .error(), .info()
//   const confirm = useConfirm();        // await confirm({ title, message, danger })
//
// confirm() resolves true/false, so call sites read like the old
// `if (!confirm('...')) return;` — just with `await`.
// ============================================================================

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const FeedbackContext = createContext(null);
export { FeedbackContext };

let nextId = 1;

const TOAST_META = {
  success: {
    accent: 'border-emerald-500/30',
    iconColor: 'text-emerald-400',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
  error: {
    accent: 'border-red-500/30',
    iconColor: 'text-red-400',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
  info: {
    accent: 'border-blue-500/30',
    iconColor: 'text-blue-400',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
};

const TOAST_DURATION_MS = 4500;

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null); // { title, message, confirmLabel, cancelLabel, danger, resolve }

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((kind, message) => {
    const id = nextId++;
    setToasts((list) => [...list.slice(-4), { id, kind, message }]);
    setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
  }, [dismissToast]);

  const toast = useMemo(() => ({
    success: (msg) => pushToast('success', msg),
    error:   (msg) => pushToast('error', msg),
    info:    (msg) => pushToast('info', msg),
  }), [pushToast]);

  const confirm = useCallback((options) => {
    const opts = typeof options === 'string' ? { message: options } : (options || {});
    return new Promise((resolve) => {
      setDialog({
        title: opts.title || 'Are you sure?',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || (opts.danger ? 'Delete' : 'Confirm'),
        cancelLabel: opts.cancelLabel || 'Cancel',
        danger: !!opts.danger,
        resolve,
      });
    });
  }, []);

  const closeDialog = useCallback((answer) => {
    setDialog((d) => {
      if (d) d.resolve(answer);
      return null;
    });
  }, []);

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* ── Toast stack (bottom-right) ── */}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))]"
        aria-live="polite"
      >
        {toasts.map(({ id, kind, message }) => {
          const meta = TOAST_META[kind] ?? TOAST_META.info;
          return (
            <div
              key={id}
              role="status"
              className={`animate-slide-up flex items-start gap-3 px-4 py-3 rounded-xl
                bg-[#13151c] border ${meta.accent} shadow-2xl`}
            >
              <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${meta.iconColor}`}
                   fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {meta.icon}
              </svg>
              <p className="flex-1 text-sm text-gray-200 break-words">{message}</p>
              <button
                type="button"
                onClick={() => dismissToast(id)}
                className="p-0.5 rounded text-gray-500 hover:text-gray-200 transition-colors"
                aria-label="Dismiss notification"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Confirm dialog ── */}
      {dialog && <ConfirmDialog dialog={dialog} onClose={closeDialog} />}
    </FeedbackContext.Provider>
  );
}

function ConfirmDialog({ dialog, onClose }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={dialog.title}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onClose(false)} />
      <div className="animate-scale-in relative w-full max-w-sm rounded-2xl bg-[#13151c] border border-white/10 shadow-2xl p-6">
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
            ${dialog.danger ? 'bg-red-500/15 text-red-400' : 'bg-blue-500/15 text-blue-400'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {dialog.danger ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v3m0 3h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              )}
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white">{dialog.title}</h3>
            {dialog.message && (
              <p className="mt-1.5 text-sm text-gray-400 whitespace-pre-line break-words">{dialog.message}</p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => onClose(false)}>
            {dialog.cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={dialog.danger ? 'btn-danger' : 'btn-primary'}
            onClick={() => onClose(true)}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
