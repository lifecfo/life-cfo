"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type ToastItem = {
  id: string;
  message: string;
  undoLabel?: string;
  onUndo?: () => Promise<void> | void;
};

export type ToastContextValue = {
  showToast: (t: Omit<ToastItem, "id">, ms?: number) => void;
  toast: (opts: { title?: string; description?: string }, ms?: number) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toastItem, setToastItem] = React.useState<ToastItem | null>(null);
  const timerRef = React.useRef<number | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const dismiss = React.useCallback(() => {
    clearTimer();
    setToastItem(null);
  }, [clearTimer]);

  const showToast = React.useCallback(
    (t: Omit<ToastItem, "id">, ms = 8000) => {
      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      setToastItem({ id, ...t });

      clearTimer();
      timerRef.current = window.setTimeout(() => setToastItem(null), ms);
    },
    [clearTimer]
  );

  const toast = React.useCallback(
    (opts: { title?: string; description?: string }, ms = 8000) => {
      const message = [opts.title, opts.description].filter(Boolean).join(" — ");
      showToast({ message: message || "Done." }, ms);
    },
    [showToast]
  );

  React.useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  return (
    <ToastContext.Provider value={{ showToast, toast }}>
      {children}

      {toastItem && (
        <div
          className={cn(
            "fixed left-1/2 bottom-4 z-[9999] w-[calc(100%-24px)] max-w-xl",
            "-translate-x-1/2"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-3 rounded-2xl border shadow-lg",
              "bg-neutral-surface border-neutral-border",
              "px-4 py-3"
            )}
          >
            <div className="flex-1 text-sm text-neutral-text leading-snug">
              {toastItem.message}
            </div>

            {toastItem.onUndo && (
              <button
                onClick={() => {
                  toastItem.onUndo?.();
                  dismiss();
                }}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-sm font-medium",
                  "bg-btn-secondary text-btn-secondaryText",
                  "hover:bg-btn-secondaryHover"
                )}
              >
                {toastItem.undoLabel ?? "Undo"}
              </button>
            )}

            <button
              onClick={dismiss}
              title="Dismiss"
              className={cn(
                "rounded-xl px-2.5 py-1.5 text-sm",
                "border border-neutral-border text-neutral-text-2",
                "hover:bg-neutral-bg"
              )}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
