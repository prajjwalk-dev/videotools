// Shared types used by both API routes and client components.

import type { SpokenLanguage } from "./languages";

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export const CAPTION_FORMATS = ["srt", "vtt", "txt", "json"] as const;
export type CaptionFormat = (typeof CAPTION_FORMATS)[number];

export interface MediaFileDto {
  id: string;
  fileName: string;
  fileType: string;
  fileFormat: string;
  fileSize: number;
  duration: number | null;
  uploadedAt: string;
}

export interface SegmentDto {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  text: string;
  confidence: number | null;
}

export interface CaptionDto {
  id: string;
  format: CaptionFormat;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

export interface VariantSummary {
  id: string;
  script: string;
  source: "whisper" | "converted";
  isPrimary: boolean;
  status: JobStatus;
  progress: number;
  errorMessage: string | null;
  wordCount: number;
}

export interface VariantDto extends VariantSummary {
  fullText: string | null;
  segments: SegmentDto[];
  captions: CaptionDto[];
}

export interface TranscriptionListItem {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  duration: number | null;
  spokenLanguage: SpokenLanguage;
  detectedLanguage: string | null;
  primaryScript: string | null;
  status: JobStatus;
  progress: number;
  stage: string | null;
  wordCount: number;
  errorMessage: string | null;
  processingDuration: number | null;
  createdAt: string;
  variants: VariantSummary[];
}

export interface TranscriptionDetail extends Omit<TranscriptionListItem, "variants"> {
  mediaFile: MediaFileDto;
  processingStartedAt: string | null;
  processingCompletedAt: string | null;
  /** Scripts that make sense to offer for this audio (see languages.ts). */
  outputOptions: string[];
  supportsBilingual: boolean;
  variants: VariantDto[];
}

export interface StatusDto {
  status: JobStatus;
  progress: number;
  stage: string | null;
  errorMessage: string | null;
  variants: VariantSummary[];
}
