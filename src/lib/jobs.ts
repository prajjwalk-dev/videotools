// Schedules pipeline jobs to run after the HTTP response is sent.
// `after()` keeps the function alive on Vercel (up to the route's maxDuration) and simply
// runs in the background on a long-running Node server.

import { after } from "next/server";
import { generateVariant, processTranscription } from "./pipeline";

const inFlight = new Set<string>();

async function exclusive(key: string, job: () => Promise<void>): Promise<void> {
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    await job();
  } catch (error) {
    console.error(`[jobs] ${key} crashed:`, error);
  } finally {
    inFlight.delete(key);
  }
}

/** Run (or re-run) the transcription of one upload. Call inside a route handler. */
export function scheduleProcessing(transcriptionId: string): void {
  after(() => exclusive(`transcription:${transcriptionId}`, () => processTranscription(transcriptionId)));
}

/** Generate one more output script for a completed transcription. Call inside a route handler. */
export function scheduleVariant(transcriptionId: string, script: string): void {
  after(() => exclusive(`variant:${transcriptionId}:${script}`, () => generateVariant(transcriptionId, script)));
}

// Route handlers that schedule jobs export `maxDuration = 300` so Vercel keeps the function alive long enough.
