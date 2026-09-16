"use client";

import { useEffect, useRef } from "react";

/** Native <dialog> modal. Children mount only while open, so they can fetch on mount. */
export function Modal({ open, onClose, title, subtitle, children, className = "max-w-2xl" }: {
  open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={`w-full ${className} rounded-2xl bg-white p-0 text-neutral-900 shadow-2xl backdrop:bg-neutral-900/50 backdrop:backdrop-blur-sm`}
    >
      {open && (
        <div>
          <header className="flex items-start justify-between gap-4 border-b border-neutral-100 px-6 py-5">
            <div>
              <h2 className="text-lg">{title}</h2>
              {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 text-xl leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">×</button>
          </header>
          <div className="px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
