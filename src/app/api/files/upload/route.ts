// POST /api/files/upload — multipart { file, language: auto|hi-en|hi|en }. Streams the file to disk,
// creates the MediaFile + Transcription rows and starts processing in the background.

import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import busboy from "busboy";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env, uploadPath } from "@/lib/env";
import { extensionOf, FORMAT_HINT, isAllowedFile, mediaKind } from "@/lib/formats";
import { ApiError, handle } from "@/lib/api";
import { startProcessing } from "@/lib/pipeline";
import { SPOKEN_LANGUAGE_CODES, type SpokenLanguage } from "@/lib/languages";

export const runtime = "nodejs";

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
  await fs.mkdir(env.uploadDir, { recursive: true });
  const { fields, file } = await parseMultipart(req);

  if (!file) throw new ApiError(400, "No file was uploaded");
  const language = (fields.language ?? "auto") as SpokenLanguage;
  if (!SPOKEN_LANGUAGE_CODES.includes(language)) {
    await fs.unlink(uploadPath(file.storagePath)).catch(() => undefined);
    throw new ApiError(400, `Invalid language. Choose from: ${SPOKEN_LANGUAGE_CODES.join(", ")}`);
  }

  const mediaFile = await prisma.mediaFile.create({
    data: {
      fileName: file.originalName,
      fileType: mediaKind(file.originalName, file.mimeType),
      fileFormat: file.ext || file.mimeType.split("/")[1] || "unknown",
      fileSize: file.size,
      storagePath: file.storagePath,
      transcription: { create: { spokenLanguage: language, status: "pending" } },
    },
    include: { transcription: true },
  });

  startProcessing(mediaFile.transcription!.id);

  return NextResponse.json(
    {
      message: "File uploaded successfully. Transcription started.",
      file_id: mediaFile.id,
      transcription_id: mediaFile.transcription!.id,
    },
    { status: 201 },
  );
});
