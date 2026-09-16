import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { requireUser } from "@/lib/auth";
import { type Ctx, fail, handle } from "@/lib/api";
import { requireViewer } from "@/lib/recordings";
import { BUCKET, r2 } from "@/lib/r2";
import { parseRange } from "@/lib/rules";

/**
 * Stream-only playback proxied through the server (never a presigned URL).
 * Supports Range so the <video> element can seek.
 */
export const GET = handle(async (req: Request, { params }: Ctx<{ classId: string }>) => {
  const user = await requireUser();
  const cls = await requireViewer(user, (await params).classId);
  const rec = cls.recording;
  if (!rec || rec.status !== "READY" || !rec.key) return fail(404, "Recording isn't ready yet.");

  let size = rec.sizeBytes;
  if (!size) {
    const head = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: rec.key }));
    size = head.ContentLength ?? 0;
  }

  const rangeHeader = req.headers.get("range");
  const range = parseRange(rangeHeader, size);
  if (rangeHeader && !range) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" } });
  }

  const obj = await r2.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: rec.key, Range: range ? `bytes=${range.start}-${range.end}` : undefined }),
  );
  const body = Readable.toWeb(obj.Body as Readable) as ReadableStream;

  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };
  if (range) {
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
    headers["Content-Length"] = String(range.end - range.start + 1);
    return new Response(body, { status: 206, headers });
  }
  headers["Content-Length"] = String(size);
  return new Response(body, { status: 200, headers });
});
