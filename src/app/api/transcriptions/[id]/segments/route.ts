// GET /api/transcriptions/:id/segments?script=hi-en — segments of one output script (default: primary).

import { NextResponse } from "next/server";
import { ApiError, handle, type IdParams } from "@/lib/api";
import { toSegmentDto } from "@/lib/serialize";
import { findVariant, primaryVariant, store } from "@/lib/store";

export const GET = handle<IdParams>(async (req, { params }) => {
  const { id } = await params;
  const script = new URL(req.url).searchParams.get("script");
  const doc = await store().get(id);
  if (!doc) throw new ApiError(404, "Transcription not found");

  const variant = script ? findVariant(doc, script) : primaryVariant(doc);
  if (!variant) throw new ApiError(404, script ? `No "${script}" transcript for this file` : "Transcript is not available yet");
  return NextResponse.json(variant.segments.map(toSegmentDto));
});
