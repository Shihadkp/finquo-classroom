import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { type Ctx, fail, handle, ok } from "@/lib/api";
import { requireRecorder } from "@/lib/recordings";
import { BUCKET, type Part, r2 } from "@/lib/r2";
import { enqueueTranscode } from "@/lib/transcode";

/** Complete the multipart upload → UPLOADED, then queue the mp4 transcode. */
export const POST = handle(async (_req: Request, { params }: Ctx<{ classId: string }>) => {
  const user = await requireUser();
  const { classId } = await params;
  const cls = await requireRecorder(user, classId);
  const rec = cls.recording;
  if (!rec || !rec.uploadId || !rec.rawKey) return fail(409, "No recording in progress.");
  if (rec.status !== "RECORDING") return ok({ status: rec.status }); // already finished — idempotent

  const parts: Part[] = JSON.parse(rec.etags).sort((a: Part, b: Part) => a.PartNumber - b.PartNumber);
  if (!parts.length) {
    await r2.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: rec.rawKey, UploadId: rec.uploadId })).catch(() => {});
    await db.recording.update({ where: { classId }, data: { status: "FAILED", error: "No data was recorded.", stoppedAt: new Date() } });
    return fail(400, "No data was recorded.");
  }

  await r2.send(
    new CompleteMultipartUploadCommand({ Bucket: BUCKET, Key: rec.rawKey, UploadId: rec.uploadId, MultipartUpload: { Parts: parts } }),
  );
  await db.recording.update({ where: { classId }, data: { status: "UPLOADED", stoppedAt: new Date() } });
  enqueueTranscode(classId);
  return ok({ status: "UPLOADED" });
});
