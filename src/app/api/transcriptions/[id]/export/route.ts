// GET /api/transcriptions/:id/export?format=srt|vtt|txt|json&script=hi-en|hi|en|both&download=true&wordsPerLine=4
// Serves the stored caption for one script; `wordsPerLine` re-splits segments on the fly (reels/shorts);
// `script=both` builds bilingual captions (Devanagari + Roman on separate lines of each cue).

import { NextResponse } from "next/server";
import { ApiError, handle, type IdParams } from "@/lib/api";
import {
  CAPTION_MIME,
  captionFileName,
  generateCaption,
  mergeBilingual,
  mergeShortSegments,
  splitSegmentsByWords,
  type CaptionSegment,
} from "@/lib/captions";
import { BILINGUAL, supportsBilingual } from "@/lib/languages";
import { findVariant, primaryVariant, store, type VariantDoc } from "@/lib/store";
import { CAPTION_FORMATS, type CaptionFormat } from "@/lib/types";

const toCaptionSegments = (v: VariantDoc): CaptionSegment[] => v.segments.map((s) => ({ start: s.startTime, end: s.endTime, text: s.text }));

export const GET = handle<IdParams>(async (req, { params }) => {
  const { id } = await params;
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "srt").toLowerCase() as CaptionFormat;
  const download = url.searchParams.get("download") === "true";
  const wordsPerLine = Math.max(0, Number.parseInt(url.searchParams.get("wordsPerLine") ?? "0", 10) || 0);
  const requestedScript = url.searchParams.get("script");

  if (!CAPTION_FORMATS.includes(format)) {
    throw new ApiError(400, `Invalid format. Choose from: ${CAPTION_FORMATS.join(", ")}`);
  }

  const doc = await store().get(id);
  if (!doc) throw new ApiError(404, "Transcription not found");
  if (doc.status !== "completed") throw new ApiError(400, "Transcription is not completed yet");
  const primary = primaryVariant(doc);
  if (!primary) throw new ApiError(400, "Transcript is not available");
  const baseName = doc.mediaFile.fileName;

  // --- Bilingual ------------------------------------------------------------
  if (requestedScript === BILINGUAL) {
    if (!supportsBilingual(primary.script)) throw new ApiError(400, "Bilingual export is only available for Hindi audio");
    const hi = findVariant(doc, "hi");
    const roman = findVariant(doc, "hi-en");
    if (hi?.status !== "completed" || roman?.status !== "completed") {
      throw new ApiError(400, "Generate both the Hindi and Hinglish versions first");
    }
    if (hi.segments.length !== roman.segments.length) throw new ApiError(500, "Hindi and Hinglish transcripts are not aligned");

    const fileName = captionFileName(baseName, format, ".hi+hinglish");
    let content: string;
    if (format === "json") {
      content = JSON.stringify(
        {
          full_text: { hi: hi.fullText ?? "", "hi-en": roman.fullText ?? "" },
          segments: hi.segments.map((s, i) => ({
            id: i,
            start: s.startTime,
            end: s.endTime,
            text: { hi: s.text, "hi-en": roman.segments[i].text },
          })),
          total_segments: hi.segments.length,
          total_duration: hi.segments.at(-1)?.endTime ?? 0,
        },
        null,
        2,
      );
    } else {
      const segments = mergeBilingual(toCaptionSegments(hi), toCaptionSegments(roman));
      content = generateCaption(format, segments, `${hi.fullText ?? ""}\n\n${roman.fullText ?? ""}`);
    }
    return respond(content, format, fileName, download);
  }

  // --- Single script --------------------------------------------------------
  const variant = requestedScript ? findVariant(doc, requestedScript) : primary;
  if (!variant || variant.status !== "completed") {
    throw new ApiError(400, requestedScript ? `The "${requestedScript}" version has not been generated yet` : "Transcript is not available");
  }

  let content: string;
  let fileName: string;
  const stored = variant.captions.find((c) => c.format === format);
  if (wordsPerLine === 0 && stored) {
    content = stored.content;
    fileName = stored.fileName;
  } else {
    const base = toCaptionSegments(variant);
    const segments = wordsPerLine > 0 ? splitSegmentsByWords(base, wordsPerLine) : mergeShortSegments(base);
    content = generateCaption(format, segments, variant.fullText ?? "");
    fileName = captionFileName(baseName, format, `.${variant.script}${wordsPerLine > 0 ? `_${wordsPerLine}words` : ""}`);
  }
  return respond(content, format, fileName, download);
});

function respond(content: string, format: CaptionFormat, fileName: string, download: boolean) {
  if (!download) return NextResponse.json({ format, fileName, content });
  return new NextResponse(content, {
    headers: {
      "Content-Type": CAPTION_MIME[format],
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
