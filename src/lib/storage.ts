// Where uploaded media lives. Locally it is a file under UPLOAD_DIR; on Vercel it is a Blob
// (the browser uploads straight to Blob storage, which sidesteps the 4.5 MB request limit).
// MediaFile.storagePath is either a file name (local) or the full blob URL.

import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { del, get } from "@vercel/blob";
import { env, uploadPath } from "./env";

export type StorageMode = "local" | "blob";

/** "blob" on Vercel (or when STORAGE_MODE=blob is set for testing), otherwise local disk. */
export function storageMode(): StorageMode {
  const forced = process.env.STORAGE_MODE?.trim().toLowerCase();
  if (forced === "blob" || forced === "local") return forced;
  return process.env.VERCEL && process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

const isRemote = (storagePath: string) => /^https?:\/\//.test(storagePath);

/** Hostname check so /api/files/register only accepts blobs from our own store. */
export function isOwnBlobUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    return hostname.endsWith(".blob.vercel-storage.com") && pathname.startsWith("/uploads/");
  } catch {
    return false;
  }
}

/**
 * Makes the media available on the local filesystem for ffmpeg and returns its path.
 * Private blobs are streamed into `workDir` through the Blob API; local files are used in place.
 */
export async function materialize(storagePath: string, workDir: string): Promise<string> {
  if (!isRemote(storagePath)) return uploadPath(storagePath);

  const result = await get(storagePath, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error("Could not download the uploaded file");
  const ext = path.extname(new URL(storagePath).pathname) || ".bin";
  const target = path.join(workDir, `source${ext}`);
  await pipeline(Readable.fromWeb(result.stream as unknown as NodeReadableStream), createWriteStream(target));
  return target;
}

export async function deleteUpload(storagePath: string): Promise<void> {
  if (isRemote(storagePath)) {
    await del(storagePath).catch((error) => console.warn("[storage] blob delete failed:", error));
    return;
  }
  await fs.unlink(uploadPath(storagePath)).catch(() => undefined);
}

export async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(env.uploadDir, { recursive: true });
}
