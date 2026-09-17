// PATCH /api/transcriptions/:id/segments/:segmentId — { text?, startTime?, endTime? }
// After an edit the variant's full text and caption files are rebuilt from its segments.

import { NextResponse } from "next/server";
import { ApiError, handle, readJson } from "@/lib/api";
import { normaliseSegmentText } from "@/lib/captions";
import { refreshVariant } from "@/lib/pipeline";
import { toSegmentDto } from "@/lib/serialize";
import { updateDoc, type SegmentDoc } from "@/lib/store";

type Params = { params: Promise<{ id: string; segmentId: string }> };

export const PATCH = handle<Params>(async (req, { params }) => {
  const { id, segmentId } = await params;
  const body = await readJson<{ text?: unknown; startTime?: unknown; endTime?: unknown }>(req);

  const data: { text?: string; startTime?: number; endTime?: number } = {};
  if (body.text !== undefined) {
    if (typeof body.text !== "string" || !body.text.trim()) throw new ApiError(400, "text must be a non-empty string");
    data.text = normaliseSegmentText(body.text);
  }
  if (body.startTime !== undefined) {
    if (typeof body.startTime !== "number" || !Number.isFinite(body.startTime) || body.startTime < 0) {
      throw new ApiError(400, "startTime must be a finite number >= 0");
    }
    data.startTime = body.startTime;
  }
  if (body.endTime !== undefined) {
    if (typeof body.endTime !== "number" || !Number.isFinite(body.endTime) || body.endTime < 0) {
      throw new ApiError(400, "endTime must be a finite number >= 0");
    }
    data.endTime = body.endTime;
  }

  let updated: SegmentDoc | null = null;
  let problem: ApiError | null = null;
  const doc = await updateDoc(id, (d) => {
    const variant = d.variants.find((v) => v.segments.some((s) => s.id === segmentId));
    const segment = variant?.segments.find((s) => s.id === segmentId);
    if (!variant || !segment) {
      problem = new ApiError(404, "Segment not found");
      return false;
    }
    const start = data.startTime ?? segment.startTime;
    const end = data.endTime ?? segment.endTime;
    if (end < start) {
      problem = new ApiError(400, "endTime must not be before startTime");
      return false;
    }
    Object.assign(segment, data);
    refreshVariant(d, variant);
    updated = segment;
  });
  if (!doc) throw new ApiError(404, "Transcription not found");
  if (problem) throw problem;

  return NextResponse.json(toSegmentDto(updated!));
});
