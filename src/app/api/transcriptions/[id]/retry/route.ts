// POST /api/transcriptions/:id/retry — re-run processing for a failed (or stuck) job.
// Re-running a completed job discards edits and generated scripts, so that needs { force: true }.

import { NextResponse } from "next/server";
import { ApiError, handle, type IdParams } from "@/lib/api";
import { scheduleProcessing } from "@/lib/jobs";
import { effectiveStatus } from "@/lib/serialize";
import { store, updateDoc } from "@/lib/store";

// Segment config must be a literal for Next.js to pick it up (keep in sync with jobs.ts).
export const maxDuration = 300;

export const POST = handle<IdParams>(async (req, { params }) => {
  const { id } = await params;
  const doc = await store().get(id);
  if (!doc) throw new ApiError(404, "Transcription not found");
  const status = effectiveStatus(doc);
  if (status === "processing") throw new ApiError(409, "Transcription is already processing");
  if (status === "completed") {
    const body = (await req.json().catch(() => null)) as { force?: unknown } | null;
    if (body?.force !== true) throw new ApiError(409, "Transcription is already completed; send { force: true } to re-run it and discard edits");
  }

  await updateDoc(id, (d) => {
    d.status = "pending";
    d.progress = 0;
    d.stage = null;
    d.errorMessage = null;
  });
  scheduleProcessing(id);
  return NextResponse.json({ message: "Transcription restarted" });
});
