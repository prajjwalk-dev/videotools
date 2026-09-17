// GET /api/transcriptions — newest first.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle } from "@/lib/api";
import { toListItem } from "@/lib/serialize";

export const GET = handle(async () => {
  const rows = await prisma.transcription.findMany({
    where: { mediaFile: { isActive: true } },
    include: { mediaFile: true, variants: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows.map(toListItem));
});
