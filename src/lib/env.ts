import path from "node:path";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const env = {
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  // turbopackIgnore: these directories are runtime config, not something to trace into the bundle.
  uploadDir: path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.UPLOAD_DIR ?? "./uploads"),
  dataDir: path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR ?? "./data"),
  maxUploadBytes: num("MAX_UPLOAD_SIZE_MB", 500) * 1024 * 1024,
  chunkSeconds: num("CHUNK_SECONDS", 600),
  /** Groq chat model used for Hindi <-> Hinglish script conversion. */
  groqTextModel: process.env.GROQ_TEXT_MODEL?.trim() || "openai/gpt-oss-120b",
};

/** Absolute path of an uploaded file. Kept in one place so Turbopack does not trace the upload dir. */
export function uploadPath(storagePath: string): string {
  return path.join(/*turbopackIgnore: true*/ env.uploadDir, storagePath);
}

