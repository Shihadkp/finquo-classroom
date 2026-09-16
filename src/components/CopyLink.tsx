"use client";

import { useToast } from "./Toast";

/** Copies an absolute URL for an in-app path (e.g. a class room). The link still requires signing in. */
export function CopyLink({ path, label = "Copy link", className = "btn-ghost px-3 py-1.5 text-xs" }: { path: string; label?: string; className?: string }) {
  const toast = useToast();
  async function copy() {
    const url = `${window.location.origin}${path}`;
    try { await navigator.clipboard.writeText(url); toast("Link copied. Sign-in is still required to join.", "ok"); }
    catch { window.prompt("Copy this link:", url); }
  }
  return <button type="button" onClick={copy} className={className} title="Copy the room link">⧉ {label}</button>;
}
