// POST /api/transcriptions/:id/variants — { script } generate another output script (e.g. "hi" or "hi-en").
// Idempotent: an existing completed or in-progress variant is returned as-is, a failed one is retried.

import { NextResponse } from "next/server";
import { ApiError, handle, readJson, type IdParams } from "@/lib/api";
import { outputOptions } from "@/lib/languages";
import { scheduleVariant } from "@/lib/jobs";
import { effectiveStatus, toVariantSummary } from "@/lib/serialize";
import { findVariant, newId, now, primaryVariant, store, updateDoc, type VariantDoc } from "@/lib/store";

// Segment config must be a literal for Next.js to pick it up (keep in sync with jobs.ts).
export const maxDuration = 300;

export const POST = handle<IdParams>(async (req, { params }) => {
  const { id } = await params;
  const body = await readJson<{ script?: unknown }>(req);
  const script = typeof body.script === "string" ? body.script.trim() : "";
  if (!script) throw new ApiError(400, "script is required");

  const doc = await store().get(id);
  if (!doc) throw new ApiError(404, "Transcription not found");
  const primary = primaryVariant(doc);
  if (doc.status !== "completed" || !primary) throw new ApiError(400, "Transcription is not completed yet");

  const allowed = outputOptions(primary.script);
  if (!allowed.includes(script)) {
    throw new ApiError(400, `"${script}" is not an available output for this audio. Available: ${allowed.join(", ")}`);
  }

  const existing = findVariant(doc, script);
  if (existing && (existing.status === "completed" || effectiveStatus(existing) === "processing")) {
    return NextResponse.json(toVariantSummary(existing));
  }

  let variant: VariantDoc | undefined;
  await updateDoc(id, (d) => {
    const stamp = now();
    const current = findVariant(d, script);
    if (current) {
      Object.assign(current, { status: "pending", progress: 0, errorMessage: null, updatedAt: stamp });
      variant = current;
    } else {
      variant = {
        id: newId(),
        script,
        source: "converted",
        isPrimary: false,
        status: "pending",
        progress: 0,
        errorMessage: null,
        fullText: null,
        wordCount: 0,
        createdAt: stamp,
        updatedAt: stamp,
        segments: [],
        captions: [],
      };
      d.variants.push(variant);
    }
  });
  scheduleVariant(id, script);
  return NextResponse.json(toVariantSummary(variant!), { status: 202 });
});
