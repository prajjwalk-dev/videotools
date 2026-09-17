// POST /api/files/upload — multipart { file, language: auto|hi-en|hi|en }. Streams the file to disk,
// creates the transcription document and starts processing in the background.
// Used for local/self-hosted runs; on Vercel the browser uploads to Blob and calls /api/files/register.

import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import busboy from "busboy";
import { NextResponse } from "next/server";
import { env, uploadPath } from "@/lib/env";
import { extensionOf, FORMAT_HINT, isAllowedFile } from "@/lib/formats";
import { ApiError, handle } from "@/lib/api";
import { createTranscription } from "@/lib/create";
import { scheduleProcessing } from "@/lib/jobs";
import { SPOKEN_LANGUAGE_CODES, type SpokenLanguage } from "@/lib/languages";
import { ensureUploadDir, storageMode } from "@/lib/storage";

export const runtime = "nodejs";
// Segment config must be a literal for Next.js to pick it up (keep in sync with jobs.ts).
export const maxDuration = 300;

interface ParsedUpload {
  fields: Record<string, string>;
  file: { originalName: string; ext: string; mimeType: string; storagePath: string; size: number } | null;
}

function parseMultipart(req: Request): Promise<ParsedUpload> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data") || !req.body) {
    throw new ApiError(400, "Expected multipart/form-data with a file");
  }

  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: { "content-type": contentType }, limits: { files: 1, fileSize: env.maxUploadBytes } });
    const result: ParsedUpload = { fields: {}, file: null };
    let writing: Promise<void> = Promise.resolve();
    let destPath: string | null = null;
    let failure: Error | null = null;

    const fail = (error: Error) => {
      failure ??= error;
    };

    bb.on("field", (name, value) => {
      result.fields[name] = value;
    });

    bb.on("file", (_name, stream, info) => {
      const ext = extensionOf(info.filename);
      if (!isAllowedFile(info.filename, info.mimeType)) {
        fail(new ApiError(400, `"${info.filename}" is not a supported audio/video file. Supported: ${FORMAT_HINT}.`));
        stream.resume();
        return;
      }

      const storagePath = ext ? `${randomUUID()}.${ext}` : randomUUID();
      destPath = uploadPath(storagePath);
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
      });
      stream.on("limit", () => {
        fail(new ApiError(413, `File exceeds the maximum size of ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB`));
      });

      writing = pipeline(stream, createWriteStream(destPath))
        .then(() => {
          result.file = { originalName: info.filename, ext, mimeType: info.mimeType, storagePath, size };
        })
        .catch(fail);
    });

    bb.on("error", (error: unknown) => fail(error instanceof Error ? error : new Error(String(error))));

    bb.on("close", async () => {
      await writing;
      if (failure) {
        if (destPath) await fs.unlink(destPath).catch(() => undefined);
        reject(failure);
      } else {
        resolve(result);
      }
    });

    Readable.fromWeb(req.body as unknown as NodeReadableStream).pipe(bb);
  });
}

export const POST = handle(async (req) => {
  if (storageMode() !== "local") throw new ApiError(400, "Direct uploads are disabled here; use the Blob upload flow");
  await ensureUploadDir();
  const { fields, file } = await parseMultipart(req);

  if (!file) throw new ApiError(400, "No file was uploaded");
  const language = (fields.language ?? "auto") as SpokenLanguage;
  if (!SPOKEN_LANGUAGE_CODES.includes(language)) {
    await fs.unlink(uploadPath(file.storagePath)).catch(() => undefined);
    throw new ApiError(400, `Invalid language. Choose from: ${SPOKEN_LANGUAGE_CODES.join(", ")}`);
  }

  const doc = await createTranscription({
    fileName: file.originalName,
    size: file.size,
    contentType: file.mimeType,
    storagePath: file.storagePath,
    language,
  });
  scheduleProcessing(doc.id);

  return NextResponse.json(
    { message: "File uploaded successfully. Transcription started.", file_id: doc.mediaFile.id, transcription_id: doc.id },
    { status: 201 },
  );
});
