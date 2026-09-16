import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page } from "@/components/Nav";
import { LeaderboardCard } from "@/components/gamification/brain";
import { GamePlay } from "@/components/gamification/GamePlay";
import { GAME_META } from "@/lib/gamification/puzzles";
import { COACH } from "@/lib/gamification/aria";
import { attemptView, getSkill, isGame, todayFor } from "@/lib/gamification/service";

export const dynamic = "force-dynamic";

/** Serves /gamification/brain/queens, /crossclimb, /pinpoint and /tango. */
export default async function GamePage({ params }: { params: Promise<{ game: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { game } = await params;
  if (!isGame(game)) notFound();
  const date = todayFor(user);
  const [attempt, skill] = await Promise.all([
    db.puzzleAttempt.findUnique({ where: { userId_game_date: { userId: user.id, game, date } }, include: { puzzle: true } }),
    getSkill(user.id, game),
  ]);

  return (
    <Page user={user} back={{ href: "/gamification/brain", label: "Brain Arena" }} links={[{ href: "/gamification", label: "Gamification" }, { href: "/gamification/speaking", label: COACH.product }]}>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <GamePlay game={game} meta={GAME_META[game]} level={skill.level} initial={attempt ? attemptView(attempt) : null} user={user} />
        <LeaderboardCard game={game} meId={user.id} date={date} />
      </div>
    </Page>
  );
}
