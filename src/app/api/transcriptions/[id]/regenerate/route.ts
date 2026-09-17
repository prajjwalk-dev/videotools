// POST /api/transcriptions/:id/regenerate — rebuild caption files of every completed script from its segments.

import { NextResponse } from "next/server";
import { ApiError, handle, type IdParams } from "@/lib/api";
import { refreshVariant } from "@/lib/pipeline";
import { store, updateDoc } from "@/lib/store";

export const POST = handle<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  const doc = await store().get(id);
  if (!doc) throw new ApiError(404, "Transcription not found");
  if (doc.status !== "completed") throw new ApiError(400, "Transcription is not completed yet");

  let count = 0;
  await updateDoc(id, (d) => {
    for (const v of d.variants) {
      if (v.status !== "completed") continue;
      refreshVariant(d, v);
      count++;
    }
  });
  return NextResponse.json({ message: `Captions regenerated for ${count} version(s)` });
});
