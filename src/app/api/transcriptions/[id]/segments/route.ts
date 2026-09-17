// GET /api/transcriptions/:id/segments?script=hi-en — segments of one output script (default: primary).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, handle, type IdParams } from "@/lib/api";
import { toSegmentDto } from "@/lib/serialize";

export const GET = handle<IdParams>(async (req, { params }) => {
  const { id } = await params;
  const script = new URL(req.url).searchParams.get("script");

  const variant = await prisma.transcriptVariant.findFirst({
    where: { transcriptionId: id, ...(script ? { script } : { isPrimary: true }) },
    include: { segments: { orderBy: { index: "asc" } } },
  });
  if (!variant) throw new ApiError(404, script ? `No "${script}" transcript for this file` : "Transcription not found");

  return NextResponse.json(variant.segments.map(toSegmentDto));
});
