import { AbortMultipartUploadCommand, CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { type Ctx, fail, handle, ok } from "@/lib/api";
import { requireRecorder } from "@/lib/recordings";
import { BUCKET, r2, rawKey } from "@/lib/r2";

/** Begin a multipart upload for the class's raw webm. Replaces any earlier unfinished attempt. */
export const POST = handle(async (_req: Request, { params }: Ctx<{ classId: string }>) => {
  const user = await requireUser();
  const { classId } = await params;
  const cls = await requireRecorder(user, classId);
  if (cls.status !== "SCHEDULED") return fail(400, "This class isn't live.");
  if (cls.recording && cls.recording.status !== "RECORDING") return fail(409, "This class already has a recording.");

  // A stale RECORDING row (e.g. mentor refreshed) — abort its upload and start fresh.
  if (cls.recording?.uploadId) {
    await r2.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: rawKey(classId), UploadId: cls.recording.uploadId })).catch(() => {});
  }

  const key = rawKey(classId);
  const { UploadId } = await r2.send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: "video/webm" }));
  if (!UploadId) return fail(502, "Storage did not return an upload id.");

  const rec = await db.recording.upsert({
    where: { classId },
    create: { classId, status: "RECORDING", uploadId: UploadId, rawKey: key },
    update: { status: "RECORDING", uploadId: UploadId, rawKey: key, etags: "[]", sizeBytes: 0, startedAt: new Date(), stoppedAt: null, error: null },
  });
  return ok({ uploadId: rec.uploadId });
});
