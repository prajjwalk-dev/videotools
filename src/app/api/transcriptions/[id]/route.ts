// GET    /api/transcriptions/:id — full detail with every output script, its segments and captions
// DELETE /api/transcriptions/:id — removes the transcription and its media file

import { NextResponse } from "next/server";
import { ApiError, handle, type IdParams } from "@/lib/api";
import { toDetail } from "@/lib/serialize";
import { deleteUpload } from "@/lib/storage";
import { store } from "@/lib/store";

export const GET = handle<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  const doc = await store().get(id);
  if (!doc) throw new ApiError(404, "Transcription not found");
  return NextResponse.json(toDetail(doc));
});

export const DELETE = handle<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  const doc = await store().get(id);
  if (!doc) throw new ApiError(404, "Transcription not found");

  await store().delete(id);
  await deleteUpload(doc.mediaFile.storagePath);
  return NextResponse.json({ message: "Transcription deleted" });
});
