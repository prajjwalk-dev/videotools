// PATCH /api/transcriptions/:id/segments/:segmentId — { text?, startTime?, endTime? }
// After an edit the variant's full text and caption files are rebuilt from its segments.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, handle, readJson } from "@/lib/api";
import { refreshVariantFromSegments } from "@/lib/pipeline";
import { toSegmentDto } from "@/lib/serialize";

type Params = { params: Promise<{ id: string; segmentId: string }> };

export const PATCH = handle<Params>(async (req, { params }) => {
  const { id, segmentId } = await params;
  const body = await readJson<{ text?: unknown; startTime?: unknown; endTime?: unknown }>(req);

  const segment = await prisma.segment.findFirst({ where: { id: segmentId, variant: { transcriptionId: id } } });
  if (!segment) throw new ApiError(404, "Segment not found");

  const data: { text?: string; startTime?: number; endTime?: number } = {};
  if (body.text !== undefined) {
    if (typeof body.text !== "string" || !body.text.trim()) throw new ApiError(400, "text must be a non-empty string");
    data.text = body.text.trim();
  }
  if (body.startTime !== undefined) {
    if (typeof body.startTime !== "number" || body.startTime < 0) throw new ApiError(400, "startTime must be >= 0");
    data.startTime = body.startTime;
  }
  if (body.endTime !== undefined) {
    if (typeof body.endTime !== "number" || body.endTime < 0) throw new ApiError(400, "endTime must be >= 0");
    data.endTime = body.endTime;
  }
  const start = data.startTime ?? segment.startTime;
  const end = data.endTime ?? segment.endTime;
  if (end < start) throw new ApiError(400, "endTime must not be before startTime");

  const updated = await prisma.segment.update({ where: { id: segmentId }, data });
  await refreshVariantFromSegments(segment.variantId);
  return NextResponse.json(toSegmentDto(updated));
});
