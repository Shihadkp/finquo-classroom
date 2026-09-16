"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Shown while UPLOADED/PROCESSING; polls status and refreshes the page when it changes. */
export function Preparing({ classId }: { classId: string }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(async () => {
      const r = await fetch(`/api/recordings/${classId}`).then((x) => x.json()).catch(() => null);
      const s = r?.data?.status;
      if (s === "READY" || s === "FAILED") router.refresh();
    }, 10_000);
    return () => clearInterval(t);
  }, [classId, router]);

  return (
    <div className="card flex items-center gap-4 text-neutral-600">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
      Recording is being prepared… this page will update automatically.
    </div>
  );
}
