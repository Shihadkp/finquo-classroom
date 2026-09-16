import { getServerSession, type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";

export type Role = "ADMIN" | "MENTOR" | "STUDENT";
export type SessionUser = { id: string; name: string; email: string; role: Role; timezone: string };

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        if (!creds?.email || !creds.password) return null;
        const user = await db.user.findUnique({ where: { email: creds.email.toLowerCase() } });
        if (!user || !(await bcrypt.compare(creds.password, user.passwordHash))) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role, timezone: user.timezone };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) Object.assign(token, user);
      return token;
    },
    session({ session, token }) {
      const t = token as unknown as SessionUser & { sub: string };
      session.user = { id: t.sub, name: t.name, email: t.email, role: t.role, timezone: t.timezone } as never;
      return session;
    },
  },
};

export async function getUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as SessionUser | undefined) ?? null;
}

/** Throws a Response (401/403) — API routes catch it via `handle()` in api.ts. */
export async function requireUser(...roles: Role[]): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw fail(401, "Please sign in.");
  if (roles.length && !roles.includes(user.role)) throw fail(403, "You don't have permission to do that.");
  return user;
}

export function fail(status: number, message: string) {
  return Response.json({ success: false, message }, { status });
}
