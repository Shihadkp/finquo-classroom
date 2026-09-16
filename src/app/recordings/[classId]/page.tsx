import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { classInclude } from "@/lib/classes";
import { fmtDate, fmtDuration, fmtTime } from "@/lib/time";
import { Page } from "@/components/Nav";
import { DeleteButton } from "@/components/DeleteButton";
import { Preparing } from "./Preparing";

export const dynamic = "force-dynamic";

export default async function RecordingPage({ params }: { params: Promise<{ classId: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { classId } = await params;
  const cls = await db.class.findUnique({ where: { id: classId }, include: classInclude });
  if (!cls) notFound();
  if (user.role !== "ADMIN") redirect("/schedule"); // recordings are admin-only (QA)
  const rec = cls.recording;

  return (
    <Page user={user}>
      <p className="mb-2 text-sm text-neutral-500">
        {fmtDate(cls.startAt, user.timezone)} · {fmtTime(cls.startAt, user.timezone)} · {cls.mentor.name} with {cls.student.name}
        {rec?.durationSec ? ` · ${fmtDuration(rec.durationSec)}` : ""}
      </p>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1>{cls.title}</h1>
        {rec && <DeleteButton url={`/api/recordings/${classId}`} confirm={`Delete this recording permanently?

The video file is removed from storage. The class itself stays.`} done="Recording deleted." label="Delete recording" />}
      </div>

      {!rec || cls.status !== "COMPLETED" ? (
        <p className="card text-neutral-500">There's no recording for this class.</p>
      ) : rec.status === "READY" ? (
        <video
          controls
          controlsList="nodownload"
          disablePictureInPicture
          playsInline
          preload="metadata"
          src={`/api/recordings/${classId}/stream`}
          className="aspect-video w-full rounded-2xl bg-black"
        />
      ) : rec.status === "FAILED" ? (
        <div className="card">
          <p className="text-neutral-700">This recording couldn't be processed.</p>
          {user.role === "ADMIN" && <p className="mt-2 break-words font-mono text-xs text-red-600">{rec.error}</p>}
        </div>
      ) : (
        <Preparing classId={classId} />
      )}
    </Page>
  );
}
