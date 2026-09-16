import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { type Ctx, fail, handle, ok, readJson } from "@/lib/api";
import { requireRecorder } from "@/lib/recordings";
import { BUCKET, r2 } from "@/lib/r2";

/** Client-side failure: drop the multipart upload and mark FAILED with the client's reason. */
export const POST = handle(async (req: Request, { params }: Ctx<{ classId: string }>) => {
  const user = await requireUser();
  const { classId } = await params;
  const cls = await requireRecorder(user, classId);
  const rec = cls.recording;
  if (!rec || rec.status !== "RECORDING") return fail(409, "No recording in progress.");

  const { reason } = await readJson<{ reason?: string }>(req);
  if (rec.uploadId && rec.rawKey) {
    await r2.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: rec.rawKey, UploadId: rec.uploadId })).catch(() => {});
  }
  await db.recording.update({
    where: { classId },
    data: { status: "FAILED", rawKey: null, uploadId: null, stoppedAt: new Date(), error: (reason ?? "Recording aborted by client").slice(0, 1000) },
  });
  return ok({ status: "FAILED" });
});
