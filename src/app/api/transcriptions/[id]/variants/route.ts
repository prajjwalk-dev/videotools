// POST /api/transcriptions/:id/variants — { script } generate another output script (e.g. "hi" or "hi-en").
// Idempotent: an existing completed variant is returned as-is, a failed one is retried.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, handle, readJson, type IdParams } from "@/lib/api";
import { outputOptions } from "@/lib/languages";
import { startVariant } from "@/lib/pipeline";
import { toVariantSummary } from "@/lib/serialize";

export const POST = handle<IdParams>(async (req, { params }) => {
  const { id } = await params;
  const body = await readJson<{ script?: unknown }>(req);
  const script = typeof body.script === "string" ? body.script.trim() : "";
  if (!script) throw new ApiError(400, "script is required");

  const transcription = await prisma.transcription.findUnique({ where: { id }, include: { variants: true } });
  if (!transcription) throw new ApiError(404, "Transcription not found");
  const primary = transcription.variants.find((v) => v.isPrimary);
  if (transcription.status !== "completed" || !primary) throw new ApiError(400, "Transcription is not completed yet");

  const allowed = outputOptions(primary.script);
  if (!allowed.includes(script)) {
    throw new ApiError(400, `"${script}" is not an available output for this audio. Available: ${allowed.join(", ")}`);
  }

  const existing = transcription.variants.find((v) => v.script === script);
  if (existing && (existing.status === "completed" || existing.status === "processing")) {
    return NextResponse.json(toVariantSummary(existing));
  }

  const variant = await prisma.transcriptVariant.upsert({
    where: { transcriptionId_script: { transcriptionId: id, script } },
    create: { transcriptionId: id, script, source: "converted", status: "pending", progress: 0 },
    update: { status: "pending", progress: 0, errorMessage: null },
  });
  startVariant(id, script);
  return NextResponse.json(toVariantSummary(variant), { status: 202 });
});
