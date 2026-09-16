import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page } from "@/components/Nav";
import { Empty } from "@/components/ui";
import { WeekGrid } from "./WeekGrid";

export const dynamic = "force-dynamic";

/** Mentors edit their own hours; admins pick any mentor with ?mentorId=. */
export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ mentorId?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role === "STUDENT") redirect("/schedule");

  const isAdmin = user.role === "ADMIN";
  const mentors = isAdmin ? await db.user.findMany({ where: { role: "MENTOR" }, select: { id: true, name: true, timezone: true }, orderBy: { name: "asc" } }) : [];
  const { mentorId } = await searchParams;
  const target = isAdmin ? mentors.find((m) => m.id === mentorId) ?? mentors[0] : { id: user.id, name: user.name, timezone: user.timezone };

  if (isAdmin && !target) {
    return <Page user={user} title="Availability"><Empty>No mentors yet. Add one first.</Empty></Page>;
  }

  const blocks = await db.availability.findMany({ where: { mentorId: target!.id }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] });

  return (
    <Page
      user={user}
      title="Availability"
      back={isAdmin ? { href: "/admin/mentors", label: "Mentors" } : undefined}
      subtitle={<>Weekly recurring hours students can be booked into, in {isAdmin ? `${target!.name}'s` : "your"} timezone (<span className="text-neutral-700">{target!.timezone}</span>). Click a cell to add an hour, click again to remove it.</>}
      action={isAdmin && mentors.length > 1 ? (
        <nav className="flex flex-wrap gap-1">
          {mentors.map((m) => (
            <Link key={m.id} href={`/availability?mentorId=${m.id}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${m.id === target!.id ? "bg-accent text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}>{m.name}</Link>
          ))}
        </nav>
      ) : null}
    >
      <WeekGrid key={target!.id} initial={blocks} mentorId={isAdmin ? target!.id : undefined} />
    </Page>
  );
}
