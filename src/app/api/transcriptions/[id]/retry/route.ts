// POST /api/transcriptions/:id/retry — re-run processing for a failed (or stuck pending) job.
// Generated output scripts are derived from the audio, so they are rebuilt from scratch too.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, handle, type IdParams } from "@/lib/api";
import { startProcessing } from "@/lib/pipeline";

export const POST = handle<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  const transcription = await prisma.transcription.findUnique({ where: { id } });
  if (!transcription) throw new ApiError(404, "Transcription not found");
  if (transcription.status === "processing") throw new ApiError(409, "Transcription is already processing");

  await prisma.transcription.update({
    where: { id },
    data: { status: "pending", progress: 0, stage: null, errorMessage: null },
  });
  startProcessing(id);
  return NextResponse.json({ message: "Transcription restarted" });
});
