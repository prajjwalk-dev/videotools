"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { FiAlertCircle, FiCheckCircle, FiX } from "react-icons/fi";

type ToastKind = "success" | "error";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const DURATION: Record<ToastKind, number> = { success: 4000, error: 8000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list, { id, kind, message }]);
      setTimeout(() => dismiss(id), DURATION[kind]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(() => ({ success: (m) => push("success", m), error: (m) => push("error", m) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-[14px] leading-snug ${
              t.kind === "success"
                ? "border-success/30 bg-success-soft text-success"
                : "border-danger/30 bg-danger-soft text-danger"
            }`}
          >
            {t.kind === "success" ? (
              <FiCheckCircle className="mt-[3px] h-4 w-4 shrink-0" />
            ) : (
              <FiAlertCircle className="mt-[3px] h-4 w-4 shrink-0" />
            )}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
              <FiX className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
