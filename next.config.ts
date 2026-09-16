import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict mode double-runs effects in dev, which would join/leave the Agora room twice.
  reactStrictMode: false,
  // ffmpeg-static ships a binary; keep it out of the bundler.
  serverExternalPackages: ["ffmpeg-static", "@prisma/client"],
};

export default nextConfig;
