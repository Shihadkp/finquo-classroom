/**
 * Public build marker. Answers "is my fix actually deployed?" without digging through
 * Render's dashboard: compare `commit` here with `git rev-parse --short HEAD` locally.
 * RENDER_GIT_COMMIT is injected by Render on every build.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    commit: (process.env.RENDER_GIT_COMMIT ?? "local").slice(0, 7),
    branch: process.env.RENDER_GIT_BRANCH ?? null,
    startedAt: new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString(),
    uptimeSec: Math.round(process.uptime()),
  });
}
