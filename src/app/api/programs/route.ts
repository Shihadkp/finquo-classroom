import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok, readJson } from "@/lib/api";
import { programInclude } from "@/lib/programs";

export const GET = handle(async () => {
  await requireUser("ADMIN", "MENTOR");
  return ok(await db.program.findMany({ include: programInclude, orderBy: { name: "asc" } }));
});

/** POST { name, titles: string[] } → program with one session per title, in order. */
export const POST = handle(async (req: Request) => {
  await requireUser("ADMIN");
  const body = await readJson<{ name?: string; titles?: string[] }>(req);
  const name = body.name?.trim();
  const titles = (body.titles ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (!name) return fail(400, "Program name is required.");
  if (!titles.length) return fail(400, "Add at least one session.");
  const program = await db.program.create({
    data: { name, sessions: { create: titles.map((title, i) => ({ title, order: i + 1 })) } },
    include: programInclude,
  });
  return ok(program, 201);
});
