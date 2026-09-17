// Converts Prisma rows into the JSON shapes the client consumes.

import type { Caption, MediaFile, Segment, Transcription, TranscriptVariant } from "@/generated/prisma/client";
import { outputOptions, supportsBilingual, type SpokenLanguage } from "./languages";
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

/** Prisma include that loads everything toDetail() needs. */
export const DETAIL_INCLUDE = {
  mediaFile: true,
  variants: {
    orderBy: { createdAt: "asc" as const },
    include: { segments: { orderBy: { index: "asc" as const } }, captions: true },
  },
};

export type VariantFull = TranscriptVariant & { segments: Segment[]; captions: Caption[] };
export type TranscriptionWithVariants = Transcription & { mediaFile: MediaFile; variants: TranscriptVariant[] };
export type TranscriptionFull = Transcription & { mediaFile: MediaFile; variants: VariantFull[] };

export function toMediaFileDto(file: MediaFile): MediaFileDto {
  return {
    id: file.id,
    fileName: file.fileName,
    fileType: file.fileType,
    fileFormat: file.fileFormat,
    fileSize: file.fileSize,
    duration: file.duration,
    uploadedAt: file.uploadedAt.toISOString(),
  };
}

export function toSegmentDto(segment: Segment): SegmentDto {
  return {
    id: segment.id,
    index: segment.index,
    startTime: segment.startTime,
    endTime: segment.endTime,
    text: segment.text,
    confidence: segment.confidence,
  };
}

export function toCaptionDto(caption: Caption): CaptionDto {
  return {
    id: caption.id,
    format: caption.format as CaptionFormat,
    fileName: caption.fileName,
    fileSize: caption.fileSize,
    createdAt: caption.createdAt.toISOString(),
  };
}

export function toVariantSummary(v: TranscriptVariant): VariantSummary {
  return {
    id: v.id,
    script: v.script,
    source: v.source as "whisper" | "converted",
    isPrimary: v.isPrimary,
    status: v.status as JobStatus,
    progress: v.progress,
    errorMessage: v.errorMessage,
    wordCount: v.wordCount,
  };
}

export function toVariantDto(v: VariantFull): VariantDto {
  return {
    ...toVariantSummary(v),
    fullText: v.fullText,
    segments: v.segments.map(toSegmentDto),
    captions: v.captions.map(toCaptionDto),
  };
}

function primaryOf(variants: TranscriptVariant[]): TranscriptVariant | undefined {
  return variants.find((v) => v.isPrimary);
}

export function toListItem(t: TranscriptionWithVariants): TranscriptionListItem {
  const primary = primaryOf(t.variants);
  return {
    id: t.id,
    fileName: t.mediaFile.fileName,
    fileType: t.mediaFile.fileType,
    fileSize: t.mediaFile.fileSize,
    duration: t.mediaFile.duration,
    spokenLanguage: t.spokenLanguage as SpokenLanguage,
    detectedLanguage: t.detectedLanguage,
    primaryScript: primary?.script ?? null,
    status: t.status as JobStatus,
    progress: t.progress,
    stage: t.stage,
    wordCount: primary?.wordCount ?? 0,
    errorMessage: t.errorMessage,
    processingDuration: t.processingDuration,
    createdAt: t.createdAt.toISOString(),
    variants: t.variants.map(toVariantSummary),
  };
}

export function toDetail(t: TranscriptionFull): TranscriptionDetail {
  const { variants: _summaries, ...base } = toListItem(t);
  void _summaries;
  const primary = primaryOf(t.variants);
  return {
    ...base,
    mediaFile: toMediaFileDto(t.mediaFile),
    processingStartedAt: t.processingStartedAt?.toISOString() ?? null,
    processingCompletedAt: t.processingCompletedAt?.toISOString() ?? null,
    outputOptions: primary ? outputOptions(primary.script) : [],
    supportsBilingual: primary ? supportsBilingual(primary.script) : false,
    variants: t.variants.map(toVariantDto),
  };
}

export function toStatus(t: Transcription & { variants: TranscriptVariant[] }): StatusDto {
  return {
    status: t.status as JobStatus,
    progress: t.progress,
    stage: t.stage,
    errorMessage: t.errorMessage,
    variants: t.variants.map(toVariantSummary),
  };
}
