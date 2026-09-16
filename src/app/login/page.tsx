"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const res = await signIn("credentials", { email: f.get("email"), password: f.get("password"), redirect: false });
    setBusy(false);
    if (res?.error) return toast("Wrong email or password.");
    router.replace("/schedule");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-8">
        <p className="mb-8 flex items-center gap-2.5">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent"><Icon name="cap" /></span>
          <span className="leading-tight">
            <span className="block text-base font-bold tracking-tight">ClassRoom</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Console</span>
          </span>
        </p>
        <h1 className="mb-1 text-2xl">Welcome back</h1>
        <p className="mb-6 text-sm text-neutral-500">Sign in to see your classes.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="mt-6 text-xs leading-relaxed text-neutral-400">
          Test accounts: admin@test.com · mentor@test.com · student@test.com — password <code>test1234</code>
        </p>
      </div>
    </main>
  );
}
