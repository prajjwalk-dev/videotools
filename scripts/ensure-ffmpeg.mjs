// Makes sure the ffmpeg binary from ffmpeg-static exists. Newer npm versions skip dependency
// install scripts unless approved, which would leave the binary missing on the build host.

import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const binary = require("ffmpeg-static");

if (binary && existsSync(binary)) {
  console.log(`ffmpeg present: ${binary}`);
} else {
  console.log("ffmpeg missing, downloading via ffmpeg-static/install.js ...");
  execSync("node install.js", { cwd: require.resolve("ffmpeg-static/package.json").replace(/package\.json$/, ""), stdio: "inherit" });
}
