// Caption generation in SRT / VTT / TXT / JSON, plus segment reshaping helpers.

import type { CaptionFormat } from "./types";

export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
}

function splitTime(seconds: number) {
  // Work in integer milliseconds so 7.1 s renders as 07,100 rather than 07,099.
  const total = Math.round(Math.max(0, seconds) * 1000);
  return {
    h: Math.floor(total / 3_600_000),
    m: Math.floor((total % 3_600_000) / 60_000),
    s: Math.floor((total % 60_000) / 1000),
    ms: total % 1000,
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** HH:MM:SS,mmm */
export function formatTimestampSrt(seconds: number): string {
  const t = splitTime(seconds);
  return `${pad(t.h)}:${pad(t.m)}:${pad(t.s)},${pad(t.ms, 3)}`;
}

/** HH:MM:SS.mmm */
export function formatTimestampVtt(seconds: number): string {
  const t = splitTime(seconds);
  return `${pad(t.h)}:${pad(t.m)}:${pad(t.s)}.${pad(t.ms, 3)}`;
}

export function generateSrt(segments: CaptionSegment[]): string {
  return segments
    .map(
      (seg, i) =>
        `${i + 1}\n${formatTimestampSrt(seg.start)} --> ${formatTimestampSrt(seg.end)}\n${seg.text.trim()}\n`,
    )
    .join("\n");
}

export function generateVtt(segments: CaptionSegment[]): string {
  const body = segments
    .map((seg) => `${formatTimestampVtt(seg.start)} --> ${formatTimestampVtt(seg.end)}\n${seg.text.trim()}\n`)
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

export function generateTxt(segments: CaptionSegment[], includeTimestamps = true): string {
  if (!includeTimestamps) return segments.map((s) => s.text.trim()).join(" ");
  return segments
    .map((seg) => `[${formatTimestampSrt(seg.start).split(",")[0]}] ${seg.text.trim()}`)
    .join("\n");
}

export function generateJson(segments: CaptionSegment[], fullText: string): string {
  return JSON.stringify(
    {
      full_text: fullText,
      segments: segments.map((s, i) => ({ id: i, start: s.start, end: s.end, text: s.text.trim() })),
      total_segments: segments.length,
      total_duration: segments.length ? segments[segments.length - 1].end : 0,
    },
    null,
    2,
  );
}

export function generateCaption(format: CaptionFormat, segments: CaptionSegment[], fullText: string): string {
  switch (format) {
    case "srt":
      return generateSrt(segments);
    case "vtt":
      return generateVtt(segments);
    case "txt":
      return generateTxt(segments, true);
    case "json":
      return generateJson(segments, fullText);
  }
}

export function generateAllFormats(segments: CaptionSegment[], fullText: string): Record<CaptionFormat, string> {
  return {
    srt: generateSrt(segments),
    vtt: generateVtt(segments),
    txt: generateTxt(segments, true),
    json: generateJson(segments, fullText),
  };
}

/** Index groups produced by the merge rule below; lets aligned scripts be merged identically. */
export function mergeGroups(segments: CaptionSegment[], minDuration = 2.0, maxChars = 80): number[][] {
  if (segments.length === 0) return [];
  const groups: number[][] = [[0]];
  let current = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    const duration = current.end - current.start;
    const combined = `${current.text} ${next.text}`;
    if (duration < minDuration && combined.length <= maxChars) {
      current.text = combined;
      current.end = next.end;
      groups[groups.length - 1].push(i);
    } else {
      current = { ...next };
      groups.push([i]);
    }
  }
  return groups;
}

/** Applies index groups to a segment list, joining texts with `joiner`. */
export function applyGroups(segments: CaptionSegment[], groups: number[][], joiner = " "): CaptionSegment[] {
  return groups.map((g) => ({
    start: segments[g[0]].start,
    end: segments[g[g.length - 1]].end,
    text: g.map((i) => segments[i].text).join(joiner),
  }));
}

/** Merge very short segments into their neighbour so captions are readable. */
export function mergeShortSegments(segments: CaptionSegment[], minDuration = 2.0, maxChars = 80): CaptionSegment[] {
  return applyGroups(segments, mergeGroups(segments, minDuration, maxChars));
}

/** Merges two 1:1 aligned scripts with the same grouping and stacks them line-by-line in each cue. */
export function mergeBilingual(primary: CaptionSegment[], secondary: CaptionSegment[]): CaptionSegment[] {
  const groups = mergeGroups(primary);
  const a = applyGroups(primary, groups);
  const b = applyGroups(secondary, groups);
  return a.map((seg, i) => ({ ...seg, text: `${seg.text}\n${b[i].text}` }));
}

/** Split segments so no caption has more than N words (for reels / shorts). Timing is interpolated per word. */
export function splitSegmentsByWords(segments: CaptionSegment[], maxWords: number): CaptionSegment[] {
  if (maxWords <= 0) return segments;
  const out: CaptionSegment[] = [];

  for (const seg of segments) {
    const words = seg.text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      out.push({ ...seg });
      continue;
    }
    const perWord = (seg.end - seg.start) / words.length;
    for (let i = 0; i < words.length; i += maxWords) {
      const chunk = words.slice(i, i + maxWords);
      out.push({
        start: round3(seg.start + i * perWord),
        end: round3(seg.start + (i + chunk.length) * perWord),
        text: chunk.join(" "),
      });
    }
  }
  return out;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Segments are single caption lines: collapse any newlines/runs of whitespace. */
export function normaliseSegmentText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export const CAPTION_MIME: Record<CaptionFormat, string> = {
  srt: "text/plain; charset=utf-8",
  vtt: "text/vtt; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
};

export function captionFileName(mediaFileName: string, format: CaptionFormat, suffix = ""): string {
  const base = mediaFileName.replace(/\.[^.]+$/, "") || "transcription";
  return `${base}${suffix}.${format}`;
}
