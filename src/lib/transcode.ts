import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import ffmpegPath from "ffmpeg-static";
import { db } from "./db";
import { BUCKET, mp4Key, r2 } from "./r2";

const TMP = path.join(process.cwd(), "tmp");
const RETRY_MS = 5 * 60_000;

// ponytail: in-process queue, one job at a time. Move to a worker if transcodes pile up.
const g = globalThis as unknown as { transcodeQueue?: string[]; transcodeBusy?: boolean; transcodeTimer?: NodeJS.Timeout };
g.transcodeQueue ??= [];

export function enqueueTranscode(classId: string) {
  if (!g.transcodeQueue!.includes(classId)) g.transcodeQueue!.push(classId);
  void drain();
}

async function drain() {
  if (g.transcodeBusy) return;
  g.transcodeBusy = true;
  try {
    let id: string | undefined;
    while ((id = g.transcodeQueue!.shift())) await transcode(id).catch((e) => console.error("[transcode]", id, e));
  } finally {
    g.transcodeBusy = false;
  }
}

/** Re-queue anything stuck in UPLOADED or FAILED (still has a raw file). Called every 5 min. */
export async function sweepPending() {
  await finalizeAbandoned();
  const rows = await db.recording.findMany({
    where: { status: { in: ["UPLOADED", "FAILED"] }, rawKey: { not: null } },
    select: { classId: true },
  });
  rows.forEach((r) => enqueueTranscode(r.classId));
}

/**
 * Mentor's tab died mid-recording: the row is still RECORDING but the class is over
 * (COMPLETED for 2+ min, or past its join window). Complete the multipart upload with
 * the parts we already hold so nothing that reached R2 is lost.
 */
async function finalizeAbandoned() {
  const cutoff = new Date(Date.now() - 2 * 60_000);
  const rows = await db.recording.findMany({
    where: {
      status: "RECORDING",
      class: { OR: [{ status: "COMPLETED", completedAt: { lt: cutoff } }, { endAt: { lt: new Date(Date.now() - 60 * 60_000) } }] },
    },
  });
  for (const rec of rows) {
    const parts: { PartNumber: number; ETag: string }[] = JSON.parse(rec.etags).sort((a: { PartNumber: number }, b: { PartNumber: number }) => a.PartNumber - b.PartNumber);
    try {
      if (!rec.uploadId || !rec.rawKey || !parts.length) throw new Error("Recording never uploaded any data.");
      await r2.send(new CompleteMultipartUploadCommand({ Bucket: BUCKET, Key: rec.rawKey, UploadId: rec.uploadId, MultipartUpload: { Parts: parts } }));
      await db.recording.update({ where: { id: rec.id }, data: { status: "UPLOADED", stoppedAt: new Date() } });
    } catch (e) {
      if (rec.uploadId && rec.rawKey) await r2.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: rec.rawKey, UploadId: rec.uploadId })).catch(() => {});
      await db.recording.update({
        where: { id: rec.id },
        data: { status: "FAILED", rawKey: null, stoppedAt: new Date(), error: e instanceof Error ? e.message : String(e) },
      });
    }
  }
}

export function startTranscodeTimer() {
  if (g.transcodeTimer) return;
  g.transcodeTimer = setInterval(() => void sweepPending().catch(console.error), RETRY_MS);
  void sweepPending().catch(console.error);
}

async function transcode(classId: string) {
  const rec = await db.recording.findUnique({ where: { classId } });
  if (!rec || !rec.rawKey || !["UPLOADED", "FAILED"].includes(rec.status)) return;
  await db.recording.update({ where: { classId }, data: { status: "PROCESSING", error: null } });

  await mkdir(TMP, { recursive: true });
  const inFile = path.join(TMP, `${classId}.webm`);
  const outFile = path.join(TMP, `${classId}.mp4`);
  try {
    const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: rec.rawKey }));
    await pipeline(obj.Body as Readable, createWriteStream(inFile));

    const durationSec = await runFfmpeg(inFile, outFile);
    const { size } = await stat(outFile);
    const key = mp4Key(classId);
    await r2.send(
      new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: createReadStream(outFile), ContentLength: size, ContentType: "video/mp4" }),
    );
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: rec.rawKey }));
    await db.recording.update({
      where: { classId },
      data: { status: "READY", key, rawKey: null, durationSec, sizeBytes: size, error: null },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 1000) : String(e);
    await db.recording.update({ where: { classId }, data: { status: "FAILED", error } });
    throw e;
  } finally {
    await Promise.all([rm(inFile, { force: true }), rm(outFile, { force: true })]);
  }
}

/** Remux/encode to faststart mp4; returns duration parsed from ffmpeg's last progress line. */
function runFfmpeg(inFile: string, outFile: string): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg binary not found (ffmpeg-static)"));
    const args = ["-y", "-i", inFile, "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-c:a", "aac", "-movflags", "+faststart", outFile];
    const proc = spawn(ffmpegPath, args);
    let log = "";
    proc.stderr.on("data", (d) => (log = (log + d.toString()).slice(-20_000)));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}: ${log.split("\n").filter(Boolean).slice(-3).join(" | ")}`));
      // MediaRecorder webm has no duration header; the final "time=HH:MM:SS.xx" progress line is the output length.
      const times = [...log.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
      const last = times.at(-1);
      resolve(last ? Math.round(+last[1] * 3600 + +last[2] * 60 + +last[3]) : 0);
    });
  });
}
