// Background jobs:
//   processTranscription  media -> audio -> Groq Whisper -> primary variant (+segments, captions)
//   generateVariant       primary variant -> LLM script conversion -> aligned variant
// Both are scheduled from route handlers via src/lib/jobs.ts and record progress in the document store.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "./env";
import { getDuration, prepareAudio, splitAudio } from "./audio";
import { convertScript } from "./convert";
import { correctLines } from "./correct";
import { normaliseLanguageCode, type SpokenLanguage } from "./languages";
import { materialize } from "./storage";
import {
  findVariant,
  newId,
  now,
  primaryVariant,
  store,
  updateDoc,
  type CaptionDoc,
  type SegmentDoc,
  type TranscriptionDoc,
  type VariantDoc,
} from "./store";
import { postProcess, transcribeFile, whisperModeFor, type TranscribedSegment } from "./transcribe";
import { applyGroups, generateAllFormats, mergeGroups, captionFileName, normaliseSegmentText, type CaptionSegment } from "./captions";
import type { CaptionFormat } from "./types";

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

async function setProgress(id: string, progress: number, stage: string) {
  await updateDoc(id, (doc) => {
    doc.progress = progress;
    doc.stage = stage;
  });
}

export async function processTranscription(id: string): Promise<void> {
  const doc = await store().get(id);
  if (!doc) throw new Error(`Transcription ${id} not found`);

  const spoken = doc.spokenLanguage as SpokenLanguage;
  const startedAt = new Date();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "transcribe-"));

  try {
    // A re-run replaces everything derived from the audio.
    await updateDoc(id, (d) => {
      d.variants = [];
      d.status = "processing";
      d.progress = 0;
      d.stage = "Reading media";
      d.errorMessage = null;
      d.detectedLanguage = null;
      d.processingStartedAt = startedAt.toISOString();
      d.processingCompletedAt = null;
      d.processingDuration = null;
    });

    const sourcePath = await materialize(doc.mediaFile.storagePath, workDir);
    const duration = await getDuration(sourcePath);
    await updateDoc(id, (d) => {
      d.mediaFile.duration = duration;
    });

    await setProgress(id, 10, "Extracting audio");
    const audioPath = await prepareAudio(sourcePath, workDir);
    const chunks = await splitAudio(audioPath, workDir, duration, env.chunkSeconds);

    // Transcribe each chunk; progress 25 -> 80 spread across chunks.
    let segments: TranscribedSegment[] = [];
    const texts: string[] = [];
    let detected: string | null = null;
    for (let i = 0; i < chunks.length; i++) {
      const label = chunks.length > 1 ? `Transcribing (part ${i + 1} of ${chunks.length})` : "Transcribing";
      await setProgress(id, 25 + Math.round((i / chunks.length) * 55), label);
      let result = await transcribeFile(chunks[i].path, whisperModeFor(spoken, detected), chunks[i].offset);
      if (detected === null) {
        detected = normaliseLanguageCode(result.language);
        // Auto-detect ran the first chunk blind; if the detected language has a better mode
        // (e.g. Hindi with its script prompt), redo that chunk so it is not transcribed worse than the rest.
        const pinned = whisperModeFor(spoken, detected);
        if (spoken === "auto" && pinned.prompt) result = await transcribeFile(chunks[i].path, pinned, chunks[i].offset);
      }
      segments.push(...result.segments);
      texts.push(result.text);
    }

    const script = whisperModeFor(spoken, detected).script ?? detected ?? "unknown";
    let fullText = texts.filter(Boolean).join(" ");
    if (segments.length === 0) segments = [{ start: 0, end: duration, text: fullText, confidence: 1 }];
    ({ text: fullText, segments } = postProcess({ text: fullText, segments, language: script }, script));

    // Spelling pass: fixes misheard words and broken word boundaries, line by line.
    await setProgress(id, 82, "Checking spelling");
    const rawTexts = segments.map((s) => s.text);
    const fixed = await correctLines(rawTexts, script);
    const corrected = fixed.some((t, i) => t !== rawTexts[i]);
    segments = segments.map((s, i) => ({ ...s, text: fixed[i] }));
    fullText = segments.map((s) => s.text).join(" ");

    await setProgress(id, 90, "Saving transcript and captions");
    const stamp = now();
    const variant: VariantDoc = {
      id: newId(),
      script,
      source: "whisper",
      isPrimary: true,
      status: "completed",
      progress: 100,
      errorMessage: null,
      fullText,
      wordCount: wordCount(fullText),
      corrected,
      createdAt: stamp,
      updatedAt: stamp,
      segments: segments.map((s, index) => ({
        id: newId(),
        index,
        startTime: s.start,
        endTime: s.end,
        text: s.text,
        ...(rawTexts[index] !== s.text ? { rawText: rawTexts[index] } : {}),
        confidence: s.confidence,
      })),
      captions: buildCaptions(doc.mediaFile.fileName, script, fullText, segments),
    };

    const completedAt = new Date();
    await updateDoc(id, (d) => {
      d.variants = [variant];
      d.status = "completed";
      d.progress = 100;
      d.stage = null;
      d.detectedLanguage = spoken === "auto" ? detected : null;
      d.processingCompletedAt = completedAt.toISOString();
      d.processingDuration = (completedAt.getTime() - startedAt.getTime()) / 1000;
    });
    console.log(`[pipeline] ${id} completed (${script}, ${segments.length} segments)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pipeline] ${id} failed:`, message);
    await updateDoc(id, (d) => {
      d.status = "failed";
      d.stage = null;
      d.errorMessage = message;
    });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Converts the primary transcript into another script, keeping segments aligned 1:1. */
export async function generateVariant(transcriptionId: string, script: string): Promise<void> {
  const doc = await store().get(transcriptionId);
  const primary = doc ? primaryVariant(doc) : undefined;
  if (!doc || !primary || primary.status !== "completed") throw new Error("Primary transcript is not ready yet");

  const setVariant = (patch: Partial<VariantDoc>) =>
    updateDoc(transcriptionId, (d) => {
      const existing = findVariant(d, script);
      const stamp = now();
      if (existing) Object.assign(existing, patch, { updatedAt: stamp });
      else
        d.variants.push({
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
          ...patch,
        });
    });

  try {
    await setVariant({ status: "processing", progress: 5, errorMessage: null });
    const lines = primary.segments.map((s) => s.text);
    const converted = await convertScript(lines, primary.script, script, (done, total) =>
      setVariant({ progress: 5 + Math.round((done / total) * 85) }).then(() => undefined),
    );
    const fullText = converted.join(" ");
    const segments: SegmentDoc[] = primary.segments.map((s, i) => ({ id: newId(), index: s.index, startTime: s.startTime, endTime: s.endTime, text: converted[i], confidence: s.confidence }));
    const captionSegments: CaptionSegment[] = segments.map((s) => ({ start: s.startTime, end: s.endTime, text: s.text }));

    await setVariant({
      status: "completed",
      progress: 100,
      fullText,
      wordCount: wordCount(fullText),
      segments,
      captions: buildCaptions(doc.mediaFile.fileName, script, fullText, captionSegments, captionGroups(primary)),
    });
    console.log(`[pipeline] ${transcriptionId} variant ${script} completed`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pipeline] ${transcriptionId} variant ${script} failed:`, message);
    await setVariant({ status: "failed", errorMessage: message }).catch(() => undefined);
  }
}

/**
 * Builds all four caption formats for one script. `groups` (from the primary transcript) decides
 * which short segments merge, so every script's captions line up cue for cue.
 */
export function buildCaptions(
  mediaFileName: string,
  script: string,
  fullText: string,
  segments: CaptionSegment[],
  groups: number[][] = mergeGroups(segments),
): CaptionDoc[] {
  const contents = generateAllFormats(applyGroups(segments, groups), fullText);
  const stamp = now();
  return (Object.keys(contents) as CaptionFormat[]).map((format) => ({
    id: newId(),
    format,
    content: contents[format],
    fileName: captionFileName(mediaFileName, format, `.${script}`),
    fileSize: Buffer.byteLength(contents[format], "utf8"),
    createdAt: stamp,
  }));
}

/** Merge grouping shared by every script of a document: computed on the primary transcript. */
export function captionGroups(primary: VariantDoc): number[][] {
  return mergeGroups(primary.segments.map((s) => ({ start: s.startTime, end: s.endTime, text: s.text })));
}

/** Recomputes a variant's full text and captions from its (edited) segments. Mutates in place. */
export function refreshVariant(doc: TranscriptionDoc, variant: VariantDoc): void {
  for (const s of variant.segments) s.text = normaliseSegmentText(s.text);
  variant.fullText = variant.segments.map((s) => s.text).join(" ");
  variant.wordCount = wordCount(variant.fullText);
  const primary = primaryVariant(doc) ?? variant;
  const groups = primary.segments.length === variant.segments.length ? captionGroups(primary) : undefined;
  variant.captions = buildCaptions(
    doc.mediaFile.fileName,
    variant.script,
    variant.fullText,
    variant.segments.map((s) => ({ start: s.startTime, end: s.endTime, text: s.text })),
    groups,
  );
  variant.updatedAt = now();
}

/**
 * Called once at server start on a long-running server: anything still marked "processing" was
 * interrupted by the restart and can never finish, so mark it failed (the UI offers a retry).
 * Not used on serverless hosts, where other instances may legitimately still be working.
 */
export async function recoverInterruptedJobs(): Promise<void> {
  const message = "Server restarted while processing. Please retry.";
  let count = 0;
  for (const doc of await store().list()) {
    const stuckJob = doc.status === "processing";
    const stuckVariants = doc.variants.filter((v) => v.status === "processing");
    if (!stuckJob && stuckVariants.length === 0) continue;
    await updateDoc(doc.id, (d) => {
      if (d.status === "processing") Object.assign(d, { status: "failed", stage: null, errorMessage: message });
      for (const v of d.variants) if (v.status === "processing") Object.assign(v, { status: "failed", errorMessage: message });
    });
    count++;
  }
  if (count) console.log(`[pipeline] marked ${count} transcription(s) interrupted by restart as failed`);
}
