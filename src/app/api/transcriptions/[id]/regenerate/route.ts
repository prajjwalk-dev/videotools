// POST /api/transcriptions/:id/regenerate — rebuild caption files of every completed script from its segments.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, handle, type IdParams } from "@/lib/api";
import { refreshVariantFromSegments } from "@/lib/pipeline";

export const POST = handle<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  const transcription = await prisma.transcription.findUnique({ where: { id }, include: { variants: true } });
  if (!transcription) throw new ApiError(404, "Transcription not found");
  if (transcription.status !== "completed") throw new ApiError(400, "Transcription is not completed yet");

  const completed = transcription.variants.filter((v) => v.status === "completed");
  for (const variant of completed) await refreshVariantFromSegments(variant.id);
  return NextResponse.json({ message: `Captions regenerated for ${completed.length} version(s)` });
});
