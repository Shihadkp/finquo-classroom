import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/api";
import { profile } from "@/lib/gamification/service";

/** GET /api/gamification/profile/xp → the shared Brain Arena + Aria profile. */
export const GET = handle(async () => ok(await profile(await requireUser())));
