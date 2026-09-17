// GET    /api/transcriptions/:id — full detail with every output script, its segments and captions
// DELETE /api/transcriptions/:id — removes the transcription, its media row and the file on disk

import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { uploadPath } from "@/lib/env";
import { ApiError, handle, type IdParams } from "@/lib/api";
import { DETAIL_INCLUDE, toDetail } from "@/lib/serialize";

export const GET = handle<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  const row = await prisma.transcription.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) throw new ApiError(404, "Transcription not found");
  return NextResponse.json(toDetail(row));
});

export const DELETE = handle<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  const row = await prisma.transcription.findUnique({ where: { id }, include: { mediaFile: true } });
  if (!row) throw new ApiError(404, "Transcription not found");

  // Deleting the media row cascades to the transcription, variants, segments and captions.
  await prisma.mediaFile.delete({ where: { id: row.mediaFileId } });
  await fs.unlink(uploadPath(row.mediaFile.storagePath)).catch(() => undefined);

  return NextResponse.json({ message: "Transcription deleted" });
});
