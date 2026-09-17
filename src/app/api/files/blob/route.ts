// POST /api/files/blob — token exchange for browser -> Vercel Blob uploads (@vercel/blob/client).
// The browser uploads the media directly to Blob storage (no 4.5 MB function limit), then
// calls /api/files/register with the resulting URL.

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { env } from "@/lib/env";
import { FORMAT_HINT, isAllowedFile } from "@/lib/formats";
import { storageMode } from "@/lib/storage";

export const POST = handle(async (req) => {
  if (storageMode() !== "blob") throw new ApiError(400, "Blob uploads are not configured (BLOB_READ_WRITE_TOKEN missing)");
  const body = (await req.json()) as HandleUploadBody;

  const result = await handleUpload({
    body,
    request: req,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const payload = safeJson(clientPayload);
      const fileName = typeof payload.fileName === "string" ? payload.fileName : pathname.split("/").pop() ?? "";
      const mime = typeof payload.contentType === "string" ? payload.contentType : null;
      if (!isAllowedFile(fileName, mime)) {
        throw new Error(`"${fileName}" is not a supported audio/video file. Supported: ${FORMAT_HINT}.`);
      }
      return {
        allowedContentTypes: ["audio/*", "video/*", "application/octet-stream", "application/ogg"],
        maximumSizeInBytes: env.maxUploadBytes,
        addRandomSuffix: true,
        tokenPayload: clientPayload ?? null,
      };
    },
    // Rows are created by /api/files/register from the browser, so nothing to do here.
    onUploadCompleted: async () => undefined,
  });

  return NextResponse.json(result);
});

function safeJson(raw: string | null | undefined): Record<string, unknown> {
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
