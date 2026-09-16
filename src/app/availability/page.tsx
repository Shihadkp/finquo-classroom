import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page } from "@/components/Nav";
import { WeekGrid } from "./WeekGrid";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "MENTOR") redirect("/schedule");

  const blocks = await db.availability.findMany({ where: { mentorId: user.id }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] });

  return (
    <Page user={user} title="Availability">
      <p className="mb-8 max-w-prose text-neutral-500">
        Weekly recurring hours students can be booked into, in your timezone (<span className="text-neutral-700">{user.timezone}</span>).
        Click a cell to add a one-hour block, or click a block to remove it.
      </p>
      <WeekGrid initial={blocks} />
    </Page>
  );
}
