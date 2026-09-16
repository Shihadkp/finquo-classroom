import { AbortMultipartUploadCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { db } from "./db";
import { BUCKET, mp4Key, r2, rawKey } from "./r2";

/**
 * Delete a class's recording: the stored files first, then the row.
 * Storage failures are logged, not thrown — a missing file must never block the delete,
 * or the row becomes undeletable. Returns false when there was nothing to delete.
 */
export async function deleteRecording(classId: string) {
  const rec = await db.recording.findUnique({ where: { classId } });
  if (!rec) return false;

  // An upload still in progress holds parts that are billed until aborted.
  if (rec.uploadId) {
    await r2.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: rec.rawKey ?? rawKey(classId), UploadId: rec.uploadId })).catch(() => {});
  }
  const keys = [rec.rawKey ?? rawKey(classId), rec.key ?? mp4Key(classId)].filter(Boolean);
  await r2
    .send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }))
    .catch((e) => console.error(`Storage cleanup failed for class ${classId}:`, e));

  await db.recording.delete({ where: { classId } });
  return true;
}

/** Delete a class and everything that hangs off it (its recording and stored video). */
export async function deleteClass(classId: string) {
  await deleteRecording(classId);
  await db.class.delete({ where: { id: classId } });
}
