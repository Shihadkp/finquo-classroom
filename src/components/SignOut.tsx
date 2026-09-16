"use client";

import { signOut } from "next-auth/react";
import { Icon } from "./ui";

export function SignOut() {
  return (
    <button onClick={() => signOut({ callbackUrl: "/login" })} title="Sign out" aria-label="Sign out" className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
      <Icon name="logout" className="size-4" />
    </button>
  );
}
