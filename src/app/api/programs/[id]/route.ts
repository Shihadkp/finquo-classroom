import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { type Ctx, fail, handle, ok, readJson } from "@/lib/api";
import { programInclude } from "@/lib/programs";

type SessionIn = { id?: string; title: string };

/**
 * PATCH { name?, sessions?: [{ id?, title }] } — sessions are replaced in the given order.
 * Existing ids are renamed/reordered, new ones created, missing ones deleted (refused if a class uses them).
 */
export const PATCH = handle(async (req: Request, { params }: Ctx<{ id: string }>) => {
  await requireUser("ADMIN");
  const { id } = await params;
  const program = await db.program.findUnique({ where: { id }, include: { sessions: { include: { _count: { select: { classes: true } } } } } });
  if (!program) return fail(404, "Program not found.");
  const body = await readJson<{ name?: string; sessions?: SessionIn[] }>(req);

  const name = body.name?.trim();
  const incoming = (body.sessions ?? []).map((s) => ({ id: s.id, title: String(s.title ?? "").trim() })).filter((s) => s.title);
  if (body.sessions && !incoming.length) return fail(400, "A program needs at least one session.");

  const keep = new Set(incoming.map((s) => s.id).filter(Boolean));
  const removed = program.sessions.filter((s) => !keep.has(s.id));
  const used = removed.find((s) => s._count.classes > 0);
  if (body.sessions && used) return fail(409, `"${used.title}" already has classes booked, so it can't be removed.`);

  await db.$transaction([
    ...(name ? [db.program.update({ where: { id }, data: { name } })] : []),
    ...(body.sessions
      ? [
          db.programSession.deleteMany({ where: { id: { in: removed.map((s) => s.id) } } }),
          ...incoming.map((s, i) =>
            s.id
              ? db.programSession.update({ where: { id: s.id }, data: { title: s.title, order: i + 1 } })
              : db.programSession.create({ data: { programId: id, title: s.title, order: i + 1 } }),
          ),
        ]
      : []),
  ]);
  return ok(await db.program.findUnique({ where: { id }, include: programInclude }));
});

export const DELETE = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  await requireUser("ADMIN");
  const { id } = await params;
  const [students, classes] = await Promise.all([
    db.user.count({ where: { programId: id } }),
    db.class.count({ where: { session: { programId: id } } }),
  ]);
  if (students || classes) return fail(409, "Unenroll its students and keep its classes' history: programs with usage can't be deleted.");
  await db.program.delete({ where: { id } });
  return ok({ id });
});
