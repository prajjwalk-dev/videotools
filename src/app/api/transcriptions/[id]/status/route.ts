// GET /api/transcriptions/:id/status — lightweight polling endpoint (job + per-script progress).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, handle, type IdParams } from "@/lib/api";
import { toStatus } from "@/lib/serialize";

export const GET = handle<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  const row = await prisma.transcription.findUnique({ where: { id }, include: { variants: true } });
  if (!row) throw new ApiError(404, "Transcription not found");
  return NextResponse.json(toStatus(row));
});
