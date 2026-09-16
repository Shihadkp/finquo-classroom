import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Page } from "@/components/Nav";
import { AriaSession } from "@/components/gamification/AriaSession";
import { COACH, MODES, type ModeId } from "@/lib/gamification/aria";

export const dynamic = "force-dynamic";

/** /gamification/speaking/session?mode=casual&scenario=coffee  or  ?mission=1 */
export default async function SpeakingSessionPage({ searchParams }: { searchParams: Promise<{ mode?: string; scenario?: string; mission?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const q = await searchParams;
  const mission = q.mission === "1";
  const mode = q.mode as ModeId | undefined;
  if (!mission && (!mode || !MODES[mode] || !MODES[mode].scenarios.some((s) => s.id === q.scenario))) redirect("/gamification/speaking");

  return (
    <Page user={user} back={{ href: "/gamification/speaking", label: COACH.product }} links={[{ href: "/gamification/brain", label: "Brain Arena" }]}>
      <AriaSession user={user} mode={mode} scenario={q.scenario} mission={mission} />
    </Page>
  );
}
