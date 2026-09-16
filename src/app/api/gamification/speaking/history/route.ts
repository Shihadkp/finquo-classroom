import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/api";
import { speakingOverview } from "@/lib/gamification/speakingService";

/** GET /api/gamification/speaking/history → finished sessions (newest first), 30-day fluency series, today's mission. */
export const GET = handle(async () => ok(await speakingOverview(await requireUser())));
