"use client";

import { createContext, useCallback, useContext, useState } from "react";

type Toast = { id: number; message: string; kind: "error" | "ok" };
const Ctx = createContext<(message: string, kind?: Toast["kind"]) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

/** fetch wrapper for our { success, data | message } API; toasts on failure, returns data or null. */
export function useApi() {
  const toast = useToast();
  return useCallback(
    async <T = unknown,>(url: string, init?: RequestInit & { json?: unknown }): Promise<T | null> => {
      const { json, ...rest } = init ?? {};
      const res = await fetch(url, {
        ...rest,
        headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
        body: json !== undefined ? JSON.stringify(json) : rest.body,
      }).catch(() => null);
      const body = await res?.json().catch(() => null);
      if (!res || !body?.success) {
        toast(body?.message ?? "Network error. Please try again.", "error");
        return null;
      }
      return body.data as T;
    },
    [toast],
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: Toast["kind"] = "error") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-full px-4 py-2 text-sm text-white shadow-lg ${t.kind === "error" ? "bg-neutral-900" : "bg-emerald-600"}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
