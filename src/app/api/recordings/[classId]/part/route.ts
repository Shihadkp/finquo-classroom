import { UploadPartCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { type Ctx, fail, handle, ok } from "@/lib/api";
import { requireRecorder } from "@/lib/recordings";
import { BUCKET, type Part, r2 } from "@/lib/r2";

/** PUT /api/recordings/[classId]/part?n=1 — body is one ≥5 MB chunk (last one may be smaller). */
export const PUT = handle(async (req: Request, { params }: Ctx<{ classId: string }>) => {
  const user = await requireUser();
  const { classId } = await params;
  const n = Number(new URL(req.url).searchParams.get("n"));
  if (!Number.isInteger(n) || n < 1 || n > 10_000) return fail(400, "Part number must be 1–10000.");

  const cls = await requireRecorder(user, classId);
  const rec = cls.recording;
  if (!rec || rec.status !== "RECORDING" || !rec.uploadId || !rec.rawKey) return fail(409, "No recording in progress.");

  // ponytail: one part (~5–10 MB) is buffered here, the whole file never is. Pipe the stream if parts grow.
  const body = Buffer.from(await req.arrayBuffer());
  if (!body.length) return fail(400, "Empty part.");

  const { ETag } = await r2.send(
    new UploadPartCommand({ Bucket: BUCKET, Key: rec.rawKey, UploadId: rec.uploadId, PartNumber: n, Body: body, ContentLength: body.length }),
  );
  if (!ETag) return fail(502, "Storage did not return an ETag.");

  const etags: Part[] = JSON.parse(rec.etags).filter((p: Part) => p.PartNumber !== n);
  etags.push({ PartNumber: n, ETag });
  await db.recording.update({
    where: { classId },
    data: { etags: JSON.stringify(etags), sizeBytes: { increment: body.length } },
  });
  return ok({ partNumber: n, etag: ETag });
});
