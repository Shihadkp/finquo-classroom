"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi, useToast } from "./Toast";

/** Permanent delete with a typed confirmation. Admin-only screens only. */
export function DeleteButton({ url, confirm: message, done, label = "Delete", className = "btn-ghost py-2 text-xs text-red-600 hover:bg-red-50" }: {
  url: string; confirm: string; done: string; label?: string; className?: string;
}) {
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!window.confirm(message)) return;
    setBusy(true);
    const okRes = await api(url, { method: "DELETE" });
    setBusy(false);
    if (okRes) { toast(done, "ok"); router.refresh(); }
  }
  return <button type="button" onClick={run} disabled={busy} className={className}>{busy ? "Deleting…" : label}</button>;
}
