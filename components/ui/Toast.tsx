"use client";

import * as React from "react";

type ToastItem = {
  id: string;
  message: string;
  undoLabel?: string;
  onUndo?: () => Promise<void> | void;
};

export type ToastContextValue = {
  showToast: (t: Omit<ToastItem, "id">, ms?: number) => void;

  // Optional convenience API (keeps other pages simple)
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
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return (
    <ToastContext.Provider value={{ showToast, toast }}>
      {children}

      {toastItem && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 18,
            transform: "translateX(-50%)",
            zIndex: 9999,
            background: "#111827",
            color: "#fff",
            borderRadius: 14,
            padding: "10px 12px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            display: "flex",
            gap: 10,
            alignItems: "center",
            maxWidth: 520,
            width: "calc(100% - 24px)",
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.95, lineHeight: 1.3, flex: "1 1 auto" }}>
            {toastItem.message}
          </div>

          {toastItem.onUndo && (
            <button
              onClick={() => {
                toastItem.onUndo?.();
                dismiss();
              }}
              style={{
                background: "#fff",
                color: "#111827",
                border: "none",
                borderRadius: 10,
                padding: "8px 10px",
                cursor: "pointer",
                fontSize: 13,
                whiteSpace: "nowrap",
              }}
            >
              {toastItem.undoLabel ?? "Undo"}
            </button>
          )}

          <button
            onClick={dismiss}
            style={{
              background: "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 10,
              padding: "8px 10px",
              cursor: "pointer",
              fontSize: 13,
            }}
            title="Dismiss"
          >
            ✕
          </button>
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
