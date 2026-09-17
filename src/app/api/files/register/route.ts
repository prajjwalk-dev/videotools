// POST /api/files/register — { url, fileName, contentType, language }
// Called by the browser after a direct-to-Blob upload: creates the transcription document
// and starts processing. Only URLs from our own Blob store are accepted.

import { head } from "@vercel/blob";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { FORMAT_HINT, isAllowedFile } from "@/lib/formats";
import { ApiError, handle, readJson } from "@/lib/api";
import { createTranscription } from "@/lib/create";
import { scheduleProcessing } from "@/lib/jobs";
import { SPOKEN_LANGUAGE_CODES, type SpokenLanguage } from "@/lib/languages";
import { isOwnBlobUrl, storageMode } from "@/lib/storage";

// Segment config must be a literal for Next.js to pick it up (keep in sync with jobs.ts).
export const maxDuration = 300;

interface RegisterBody {
  url?: unknown;
  fileName?: unknown;
  contentType?: unknown;
  language?: unknown;
}

export const POST = handle(async (req) => {
  if (storageMode() !== "blob") throw new ApiError(400, "Blob uploads are not configured");
  const body = await readJson<RegisterBody>(req);

  const url = typeof body.url === "string" ? body.url : "";
  if (!isOwnBlobUrl(url)) throw new ApiError(400, "url must point to this app's upload store");
  const fileName =
    typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : decodeURIComponent(url.split("/").pop() ?? "upload");
  const contentType = typeof body.contentType === "string" ? body.contentType : null;
  const language = (typeof body.language === "string" ? body.language : "auto") as SpokenLanguage;
  if (!SPOKEN_LANGUAGE_CODES.includes(language)) {
    throw new ApiError(400, `Invalid language. Choose from: ${SPOKEN_LANGUAGE_CODES.join(", ")}`);
  }
  if (!isAllowedFile(fileName, contentType)) {
    throw new ApiError(400, `"${fileName}" is not a supported audio/video file. Supported: ${FORMAT_HINT}.`);
  }

  // Trust the store, not the client, for the size.
  const blob = await head(url).catch(() => null);
  if (!blob) throw new ApiError(400, "Uploaded file not found in the store");
  if (blob.size > env.maxUploadBytes) {
    throw new ApiError(413, `File exceeds the maximum size of ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB`);
  }

  const doc = await createTranscription({ fileName, size: blob.size, contentType, storagePath: url, language });
  scheduleProcessing(doc.id);

  return NextResponse.json(
    { message: "File registered. Transcription started.", file_id: doc.mediaFile.id, transcription_id: doc.id },
    { status: 201 },
  );
});
