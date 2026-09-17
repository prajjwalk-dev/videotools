import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / binary-path packages must not be bundled by Turbopack.
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
    "ffmpeg-static",
    "busboy",
  ],
};

export default nextConfig;
