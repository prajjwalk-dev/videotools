// ffmpeg helpers: duration probing, audio extraction/normalisation, and chunking.
// Uses the binary bundled by ffmpeg-static so nothing needs to be installed on the machine.

import { execFile } from "node:child_process";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

function ffmpegBinary(): string {
  if (!ffmpegPath) throw new Error("ffmpeg binary not found (ffmpeg-static did not resolve a path)");
  return ffmpegPath;
}

/** Runs ffmpeg and resolves with stderr (ffmpeg writes its diagnostics there). */
function runFfmpeg(args: string[], allowFailure = false): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegBinary(), args, { maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (error, _stdout, stderr) => {
      if (error && !allowFailure) {
        const tail = stderr.trim().split("\n").slice(-6).join("\n");
        console.error("[ffmpeg]", tail || error.message);
        reject(new Error(friendlyFfmpegError(tail)));
        return;
      }
      resolve(stderr);
    });
  });
}

/** Turns ffmpeg's diagnostics into a message safe to show users (the raw tail is logged server-side). */
function friendlyFfmpegError(stderrTail: string): string {
  if (/does not contain any stream|Output file is empty|matches no streams/i.test(stderrTail)) return "This file has no audio track";
  if (/Invalid data found|moov atom not found|could not find codec parameters/i.test(stderrTail)) {
    return "Could not read this media file — it may be corrupt or not a real audio/video file";
  }
  return "Could not extract audio from this file";
}

/** Media duration in seconds, parsed from `ffmpeg -i` output. */
export async function getDuration(filePath: string): Promise<number> {
  // ffmpeg exits non-zero when no output is given; we only want the probe text.
  const stderr = await runFfmpeg(["-hide_banner", "-i", filePath], true);
  const match = stderr.match(/Duration:\s*(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!match) throw new Error("Could not read this media file — it may be corrupt or not a real audio/video file");
  if (!/Stream #\d+:\d+.*Audio:/.test(stderr)) throw new Error("This file has no audio track");
  const [, h, m, s, frac] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + (frac ? Number(`0.${frac}`) : 0);
}

/**
 * Converts any supported audio/video input into a compact 16 kHz mono MP3.
 * Whisper only needs 16 kHz mono, and this keeps uploads to Groq small.
 */
export async function prepareAudio(inputPath: string, workDir: string): Promise<string> {
  const output = path.join(workDir, "audio.mp3");
  await runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "48k",
    output,
  ]);
  return output;
}

export interface AudioChunk {
  path: string;
  /** Seconds from the start of the original media. */
  offset: number;
}

/** Splits a prepared MP3 into fixed-length chunks with exact known offsets. */
export async function splitAudio(
  audioPath: string,
  workDir: string,
  duration: number,
  chunkSeconds: number,
): Promise<AudioChunk[]> {
  if (duration <= chunkSeconds) return [{ path: audioPath, offset: 0 }];

  const chunks: AudioChunk[] = [];
  const count = Math.ceil(duration / chunkSeconds);
  for (let i = 0; i < count; i++) {
    const offset = i * chunkSeconds;
    const out = path.join(workDir, `chunk_${String(i).padStart(3, "0")}.mp3`);
    await runFfmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(offset),
      "-t",
      String(chunkSeconds),
      "-i",
      audioPath,
      "-c",
      "copy",
      out,
    ]);
    chunks.push({ path: out, offset });
  }
  return chunks;
}
