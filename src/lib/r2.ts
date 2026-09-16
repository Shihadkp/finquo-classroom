import { S3Client } from "@aws-sdk/client-s3";

// Cloudflare R2 speaks the S3 API; this is only the client library, no AWS account involved.
export const r2 = new S3Client({
  region: "auto",
  // Any S3-compatible store works (Backblaze B2, MinIO...): set R2_ENDPOINT to override.
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export const BUCKET = process.env.R2_BUCKET ?? "";

export const rawKey = (classId: string) => `recordings/${classId}/raw.webm`;
export const mp4Key = (classId: string) => `recordings/${classId}/class.mp4`;

export type Part = { PartNumber: number; ETag: string };
