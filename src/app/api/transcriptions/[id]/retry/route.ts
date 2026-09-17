// POST /api/transcriptions/:id/retry — re-run processing for a failed (or stuck) job.
// Generated output scripts are derived from the audio, so they are rebuilt from scratch too.

import { NextResponse } from "next/server";
import { ApiError, handle, type IdParams } from "@/lib/api";
import { scheduleProcessing } from "@/lib/jobs";
import { effectiveStatus } from "@/lib/serialize";
import { store, updateDoc } from "@/lib/store";

// Segment config must be a literal for Next.js to pick it up (keep in sync with jobs.ts).
export const maxDuration = 300;

export const POST = handle<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  const doc = await store().get(id);
  if (!doc) throw new ApiError(404, "Transcription not found");
  if (effectiveStatus(doc) === "processing") throw new ApiError(409, "Transcription is already processing");

  await updateDoc(id, (d) => {
    d.status = "pending";
    d.progress = 0;
    d.stage = null;
    d.errorMessage = null;
  });
  scheduleProcessing(id);
  return NextResponse.json({ message: "Transcription restarted" });
});
