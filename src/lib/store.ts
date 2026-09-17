// Persistence: one JSON document per transcription (media info + every output script with its
// segments and captions). Locally the documents are files under DATA_DIR; on Vercel they are
// private blobs in the same Vercel Blob store that holds the uploaded media. No database needed.

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { del, get, list, put } from "@vercel/blob";
import { env } from "./env";
import { storageMode } from "./storage";

export interface SegmentDoc {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  text: string;
  confidence: number | null;
}

export interface CaptionDoc {
  id: string;
  format: string;
  content: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

export interface VariantDoc {
  id: string;
  script: string;
  source: "whisper" | "converted";
  isPrimary: boolean;
  status: string;
  progress: number;
  errorMessage: string | null;
  fullText: string | null;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  segments: SegmentDoc[];
  captions: CaptionDoc[];
}

export interface MediaDoc {
  id: string;
  fileName: string;
  fileType: string;
  fileFormat: string;
  fileSize: number;
  /** Local file name under UPLOAD_DIR, or the blob URL. */
  storagePath: string;
  duration: number | null;
  uploadedAt: string;
}

export interface TranscriptionDoc {
  id: string;
  mediaFile: MediaDoc;
  spokenLanguage: string;
  detectedLanguage: string | null;
  status: string;
  progress: number;
  stage: string | null;
  errorMessage: string | null;
  processingStartedAt: string | null;
  processingCompletedAt: string | null;
  processingDuration: number | null;
  createdAt: string;
  updatedAt: string;
  variants: VariantDoc[];
}

export const newId = () => randomUUID();
export const now = () => new Date().toISOString();

interface DocStore {
  list(): Promise<TranscriptionDoc[]>;
  get(id: string): Promise<TranscriptionDoc | null>;
  save(doc: TranscriptionDoc): Promise<void>;
  delete(id: string): Promise<void>;
}

const ID_RE = /^[0-9a-f-]{36}$/i;

// --- Local files -------------------------------------------------------------

class FileDocStore implements DocStore {
  private dir = path.join(env.dataDir, "transcriptions");

  private file(id: string) {
    if (!ID_RE.test(id)) throw new Error("Invalid id");
    return path.join(this.dir, `${id}.json`);
  }

  async list() {
    await fs.mkdir(this.dir, { recursive: true });
    const names = (await fs.readdir(this.dir)).filter((n) => n.endsWith(".json"));
    const docs = await Promise.all(names.map((n) => this.get(n.replace(/\.json$/, ""))));
    return sortNewest(docs.filter((d): d is TranscriptionDoc => !!d));
  }

  async get(id: string) {
    try {
      return JSON.parse(await fs.readFile(this.file(id), "utf8")) as TranscriptionDoc;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async save(doc: TranscriptionDoc) {
    await fs.mkdir(this.dir, { recursive: true });
    const target = this.file(doc.id);
    const tmp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(doc), "utf8");
    // On Windows a rename over a file that is being read fails with EPERM; retry briefly.
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmp, target);
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EPERM" || attempt >= 10) {
          await fs.unlink(tmp).catch(() => undefined);
          throw error;
        }
        await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
      }
    }
  }

  async delete(id: string) {
    await fs.unlink(this.file(id)).catch(() => undefined);
  }
}

// --- Vercel Blob (private) ---------------------------------------------------

const BLOB_PREFIX = "data/transcriptions/";

class BlobDocStore implements DocStore {
  private pathname(id: string) {
    if (!ID_RE.test(id)) throw new Error("Invalid id");
    return `${BLOB_PREFIX}${id}.json`;
  }

  async list() {
    const docs: TranscriptionDoc[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: BLOB_PREFIX, limit: 1000, cursor });
      const ids = page.blobs.map((b) => b.pathname.slice(BLOB_PREFIX.length).replace(/\.json$/, ""));
      // Read in small parallel batches so a big library does not open hundreds of connections at once.
      for (let i = 0; i < ids.length; i += 16) {
        const batch = await Promise.all(ids.slice(i, i + 16).map((id) => this.get(id)));
        docs.push(...batch.filter((d): d is TranscriptionDoc => !!d));
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return sortNewest(docs);
  }

  async get(id: string) {
    const result = await get(this.pathname(id), { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as TranscriptionDoc;
  }

  async save(doc: TranscriptionDoc) {
    await put(this.pathname(doc.id), JSON.stringify(doc), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  }

  async delete(id: string) {
    await del(this.pathname(id)).catch(() => undefined);
  }
}

function sortNewest(docs: TranscriptionDoc[]) {
  return docs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

let instance: DocStore | null = null;
export function store(): DocStore {
  instance ??= storageMode() === "blob" ? new BlobDocStore() : new FileDocStore();
  return instance;
}

/**
 * Read-modify-write helper. `mutate` may return false to skip saving.
 * Re-reads right before writing so concurrent progress updates and user edits rarely collide.
 */
export async function updateDoc(
  id: string,
  mutate: (doc: TranscriptionDoc) => void | false | Promise<void | false>,
): Promise<TranscriptionDoc | null> {
  const doc = await store().get(id);
  if (!doc) return null;
  if ((await mutate(doc)) === false) return doc;
  doc.updatedAt = now();
  await store().save(doc);
  return doc;
}

export function findVariant(doc: TranscriptionDoc, script: string): VariantDoc | undefined {
  return doc.variants.find((v) => v.script === script);
}

export function primaryVariant(doc: TranscriptionDoc): VariantDoc | undefined {
  return doc.variants.find((v) => v.isPrimary);
}
