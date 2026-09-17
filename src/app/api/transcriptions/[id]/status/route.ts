// GET /api/transcriptions/:id/status — lightweight polling endpoint (job + per-script progress).

import { NextResponse } from "next/server";
import { ApiError, handle, type IdParams } from "@/lib/api";
import { toStatus } from "@/lib/serialize";
import { store } from "@/lib/store";

export const GET = handle<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  const doc = await store().get(id);
  if (!doc) throw new ApiError(404, "Transcription not found");
  return NextResponse.json(toStatus(doc));
});
