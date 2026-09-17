// Background jobs:
//   processTranscription  media -> audio -> Groq Whisper -> primary TranscriptVariant (+segments, captions)
//   generateVariant       primary variant -> LLM script conversion -> aligned TranscriptVariant
// Both run in-process, fire-and-forget, and record progress in the database for the UI to poll.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "./db";
import { env, uploadPath } from "./env";
import { getDuration, prepareAudio, splitAudio } from "./audio";
import { convertScript } from "./convert";
import { normaliseLanguageCode, type SpokenLanguage } from "./languages";
import { postProcess, transcribeFile, whisperModeFor, type TranscribedSegment } from "./transcribe";
import { generateAllFormats, mergeShortSegments, captionFileName, type CaptionSegment } from "./captions";
import type { CaptionFormat } from "./types";

const inFlight = new Set<string>();

function runInBackground(key: string, job: () => Promise<void>): void {
  if (inFlight.has(key)) return;
  inFlight.add(key);
  job()
    .catch((error) => console.error(`[pipeline] ${key} crashed:`, error))
    .finally(() => inFlight.delete(key));
}

/** Kicks off (re)processing of a transcription without awaiting it. */
export function startProcessing(transcriptionId: string): void {
  runInBackground(`transcription:${transcriptionId}`, () => processTranscription(transcriptionId));
}

/** Kicks off generation of an additional output script for a completed transcription. */
export function startVariant(transcriptionId: string, script: string): void {
  runInBackground(`variant:${transcriptionId}:${script}`, () => generateVariant(transcriptionId, script));
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

async function setProgress(id: string, progress: number, stage: string) {
  await prisma.transcription.update({ where: { id }, data: { progress, stage } });
}

export async function processTranscription(id: string): Promise<void> {
  const transcription = await prisma.transcription.findUnique({ where: { id }, include: { mediaFile: true } });
  if (!transcription) throw new Error(`Transcription ${id} not found`);

  const { mediaFile } = transcription;
  const spoken = transcription.spokenLanguage as SpokenLanguage;
  const sourcePath = uploadPath(mediaFile.storagePath);
  const startedAt = new Date();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "transcribe-"));

  try {
    // A re-run replaces everything derived from the audio.
    await prisma.$transaction([
      prisma.transcriptVariant.deleteMany({ where: { transcriptionId: id } }),
      prisma.transcription.update({
        where: { id },
        data: {
          status: "processing",
          progress: 0,
          stage: "Reading media",
          errorMessage: null,
          detectedLanguage: null,
          processingStartedAt: startedAt,
          processingCompletedAt: null,
          processingDuration: null,
        },
      }),
    ]);

    const duration = await getDuration(sourcePath);
    await prisma.mediaFile.update({ where: { id: mediaFile.id }, data: { duration } });

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
      const result = await transcribeFile(chunks[i].path, whisperModeFor(spoken, detected), chunks[i].offset);
      detected ??= normaliseLanguageCode(result.language);
      segments.push(...result.segments);
      texts.push(result.text);
    }

    const script = whisperModeFor(spoken).script ?? detected ?? "unknown";
    let fullText = texts.filter(Boolean).join(" ");
    if (segments.length === 0) segments = [{ start: 0, end: duration, text: fullText, confidence: 1 }];
    ({ text: fullText, segments } = postProcess({ text: fullText, segments, language: script }, script));

    await setProgress(id, 88, "Saving transcript");
    const variant = await prisma.transcriptVariant.create({
      data: {
        transcriptionId: id,
        script,
        source: "whisper",
        isPrimary: true,
        status: "completed",
        progress: 100,
        fullText,
        wordCount: wordCount(fullText),
        segments: {
          create: segments.map((s, index) => ({
            index,
            startTime: s.start,
            endTime: s.end,
            text: s.text,
            confidence: s.confidence,
          })),
        },
      },
    });

    await setProgress(id, 94, "Generating captions");
    await regenerateCaptions(variant.id, mediaFile.fileName, script, fullText, segments);

    const completedAt = new Date();
    await prisma.transcription.update({
      where: { id },
      data: {
        status: "completed",
        progress: 100,
        stage: null,
        detectedLanguage: spoken === "auto" ? detected : null,
        processingCompletedAt: completedAt,
        processingDuration: (completedAt.getTime() - startedAt.getTime()) / 1000,
      },
    });
    console.log(`[pipeline] ${id} completed (${script}, ${segments.length} segments)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pipeline] ${id} failed:`, message);
    await prisma.transcription.update({ where: { id }, data: { status: "failed", stage: null, errorMessage: message } });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Converts the primary transcript into another script, keeping segments aligned 1:1. */
export async function generateVariant(transcriptionId: string, script: string): Promise<void> {
  const transcription = await prisma.transcription.findUnique({
    where: { id: transcriptionId },
    include: {
      mediaFile: true,
      variants: { where: { isPrimary: true }, include: { segments: { orderBy: { index: "asc" } } } },
    },
  });
  const primary = transcription?.variants[0];
  if (!transcription || !primary || primary.status !== "completed") {
    throw new Error("Primary transcript is not ready yet");
  }

  const variant = await prisma.transcriptVariant.upsert({
    where: { transcriptionId_script: { transcriptionId, script } },
    create: { transcriptionId, script, source: "converted", status: "processing", progress: 5 },
    update: { status: "processing", progress: 5, errorMessage: null },
  });

  try {
    const lines = primary.segments.map((s) => s.text);
    const converted = await convertScript(lines, primary.script, script, async (done, total) => {
      await prisma.transcriptVariant.update({
        where: { id: variant.id },
        data: { progress: 5 + Math.round((done / total) * 85) },
      });
    });
    const fullText = converted.join(" ");
    const segments: CaptionSegment[] = primary.segments.map((s, i) => ({ start: s.startTime, end: s.endTime, text: converted[i] }));

    await prisma.$transaction([
      prisma.segment.deleteMany({ where: { variantId: variant.id } }),
      prisma.segment.createMany({
        data: primary.segments.map((s, index) => ({
          variantId: variant.id,
          index,
          startTime: s.startTime,
          endTime: s.endTime,
          text: converted[index],
          confidence: s.confidence,
        })),
      }),
    ]);
    await regenerateCaptions(variant.id, transcription.mediaFile.fileName, script, fullText, segments);
    await prisma.transcriptVariant.update({
      where: { id: variant.id },
      data: { status: "completed", progress: 100, fullText, wordCount: wordCount(fullText) },
    });
    console.log(`[pipeline] ${transcriptionId} variant ${script} completed`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pipeline] ${transcriptionId} variant ${script} failed:`, message);
    await prisma.transcriptVariant.update({ where: { id: variant.id }, data: { status: "failed", errorMessage: message } });
  }
}

/** Rebuilds all four caption formats for one variant and stores them. */
export async function regenerateCaptions(
  variantId: string,
  mediaFileName: string,
  script: string,
  fullText: string,
  segments: CaptionSegment[],
): Promise<void> {
  const contents = generateAllFormats(mergeShortSegments(segments), fullText);
  await prisma.$transaction([
    prisma.caption.deleteMany({ where: { variantId } }),
    prisma.caption.createMany({
      data: (Object.keys(contents) as CaptionFormat[]).map((format) => ({
        variantId,
        format,
        content: contents[format],
        fileName: captionFileName(mediaFileName, format, `.${script}`),
        fileSize: Buffer.byteLength(contents[format], "utf8"),
      })),
    }),
  ]);
}

/** Rebuilds full text + captions of a variant from its (edited) segments. */
export async function refreshVariantFromSegments(variantId: string): Promise<void> {
  const variant = await prisma.transcriptVariant.findUniqueOrThrow({
    where: { id: variantId },
    include: { transcription: { include: { mediaFile: true } }, segments: { orderBy: { index: "asc" } } },
  });
  const fullText = variant.segments.map((s) => s.text).join(" ");
  await prisma.transcriptVariant.update({ where: { id: variantId }, data: { fullText, wordCount: wordCount(fullText) } });
  await regenerateCaptions(
    variantId,
    variant.transcription.mediaFile.fileName,
    variant.script,
    fullText,
    variant.segments.map((s) => ({ start: s.startTime, end: s.endTime, text: s.text })),
  );
}

/**
 * Called once at server start: anything still marked "processing" was interrupted
 * by a restart and can never finish, so mark it failed (the UI offers a retry).
 */
export async function recoverInterruptedJobs(): Promise<void> {
  const message = "Server restarted while processing. Please retry.";
  const [jobs, variants] = await prisma.$transaction([
    prisma.transcription.updateMany({ where: { status: "processing" }, data: { status: "failed", stage: null, errorMessage: message } }),
    prisma.transcriptVariant.updateMany({ where: { status: "processing" }, data: { status: "failed", errorMessage: message } }),
  ]);
  if (jobs.count || variants.count) {
    console.log(`[pipeline] marked ${jobs.count} transcription(s) and ${variants.count} variant(s) interrupted by restart as failed`);
  }
}
