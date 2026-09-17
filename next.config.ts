import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / binary-path packages must not be bundled by Turbopack.
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
    "@prisma/adapter-pg",
    "pg",
    "ffmpeg-static",
    "busboy",
  ],
  // The ffmpeg binary is resolved at runtime by ffmpeg-static; make sure it ships with the API functions.
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
};

export default nextConfig;
