// Converts stored documents into the JSON shapes the client consumes.

import { outputOptions, supportsBilingual, type SpokenLanguage } from "./languages";
import type { CaptionDoc, SegmentDoc, TranscriptionDoc, VariantDoc } from "./store";
import type {
  CaptionDto,
  CaptionFormat,
  JobStatus,
  MediaFileDto,
  SegmentDto,
  StatusDto,
  TranscriptionDetail,
  TranscriptionListItem,
  VariantDto,
  VariantSummary,
} from "./types";

/** A job that has not written progress for this long can no longer be running (e.g. the serverless function was cut off). */
const STALE_MS = 20 * 60 * 1000;
const STALE_MESSAGE = "Processing was interrupted. Please retry.";

/** Status as the user should see it: in-flight jobs that went silent count as failed. */
export function effectiveStatus(row: { status: string; updatedAt: string }): JobStatus {
  const status = row.status as JobStatus;
  if ((status === "processing" || status === "pending") && Date.now() - Date.parse(row.updatedAt) > STALE_MS) return "failed";
  return status;
}

function effectiveError(row: { status: string; updatedAt: string; errorMessage: string | null }): string | null {
  return effectiveStatus(row) === "failed" && row.status !== "failed" ? STALE_MESSAGE : row.errorMessage;
}

export function toMediaFileDto(m: TranscriptionDoc["mediaFile"]): MediaFileDto {
  return {
    id: m.id,
    fileName: m.fileName,
    fileType: m.fileType,
    fileFormat: m.fileFormat,
    fileSize: m.fileSize,
    duration: m.duration,
    uploadedAt: m.uploadedAt,
  };
}

export function toSegmentDto(s: SegmentDoc): SegmentDto {
  return { id: s.id, index: s.index, startTime: s.startTime, endTime: s.endTime, text: s.text, confidence: s.confidence };
}

export function toCaptionDto(c: CaptionDoc): CaptionDto {
  return { id: c.id, format: c.format as CaptionFormat, fileName: c.fileName, fileSize: c.fileSize, createdAt: c.createdAt };
}

export function toVariantSummary(v: VariantDoc): VariantSummary {
  return {
    id: v.id,
    script: v.script,
    source: v.source,
    isPrimary: v.isPrimary,
    status: effectiveStatus(v),
    progress: v.progress,
    errorMessage: effectiveError(v),
    wordCount: v.wordCount,
  };
}

export function toVariantDto(v: VariantDoc): VariantDto {
  return { ...toVariantSummary(v), fullText: v.fullText, segments: v.segments.map(toSegmentDto), captions: v.captions.map(toCaptionDto) };
}

export function toListItem(t: TranscriptionDoc): TranscriptionListItem {
  const primary = t.variants.find((v) => v.isPrimary);
  return {
    id: t.id,
    fileName: t.mediaFile.fileName,
    fileType: t.mediaFile.fileType,
    fileSize: t.mediaFile.fileSize,
    duration: t.mediaFile.duration,
    spokenLanguage: t.spokenLanguage as SpokenLanguage,
    detectedLanguage: t.detectedLanguage,
    primaryScript: primary?.script ?? null,
    status: effectiveStatus(t),
    progress: t.progress,
    stage: t.stage,
    wordCount: primary?.wordCount ?? 0,
    errorMessage: effectiveError(t),
    processingDuration: t.processingDuration,
    createdAt: t.createdAt,
    variants: t.variants.map(toVariantSummary),
  };
}

export function toDetail(t: TranscriptionDoc): TranscriptionDetail {
  const { variants: _summaries, ...base } = toListItem(t);
  void _summaries;
  const primary = t.variants.find((v) => v.isPrimary);
  return {
    ...base,
    mediaFile: toMediaFileDto(t.mediaFile),
    processingStartedAt: t.processingStartedAt,
    processingCompletedAt: t.processingCompletedAt,
    outputOptions: primary ? outputOptions(primary.script) : [],
    supportsBilingual: primary ? supportsBilingual(primary.script) : false,
    variants: t.variants.map(toVariantDto),
  };
}

export function toStatus(t: TranscriptionDoc): StatusDto {
  return {
    status: effectiveStatus(t),
    progress: t.progress,
    stage: t.stage,
    errorMessage: effectiveError(t),
    variants: t.variants.map(toVariantSummary),
  };
}
