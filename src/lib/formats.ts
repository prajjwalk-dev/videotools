// Accepted media formats. Client-safe (no Node imports) — used by the upload page, env and API.
// Everything here is decodable by the bundled ffmpeg; the pipeline probes the file anyway,
// so an unreadable file fails with a clear message instead of being silently rejected.

export const AUDIO_EXTENSIONS = [
  "mp3", "wav", "m4a", "flac", "aac", "ogg", "oga", "opus", "wma", "amr", "aiff", "aif",
  "weba", "mka", "ac3", "3ga", "caf", "ape", "mp2", "au", "awb", "dss", "mpga", "spx", "wv", "m4r", "gsm", "aifc",
] as const;

export const VIDEO_EXTENSIONS = [
  "mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv", "flv", "mpeg", "mpg", "3gp", "3g2",
  "ts", "mts", "m2ts", "ogv", "mxf", "vob", "3gpp", "asf", "f4v", "ogm", "mpe",
] as const;

export const ALLOWED_EXTENSIONS: readonly string[] = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];

/** Value for <input accept>: MIME wildcards keep the OS file dialog permissive, extensions cover odd MIME types. */
export const FILE_ACCEPT = ["audio/*", "video/*", ...ALLOWED_EXTENSIONS.map((e) => `.${e}`)].join(",");

/** Short list for UI hints. */
export const FORMAT_HINT = "MP3, WAV, M4A, OGG, OPUS, AAC, FLAC, WMA, AMR, MP4, MOV, MKV, WEBM, AVI and more";

export function extensionOf(fileName: string | null | undefined): string {
  const match = /\.([a-z0-9]+)$/i.exec((fileName ?? "").trim());
  return match ? match[1].toLowerCase() : "";
}

function isMediaMime(mime: string | null | undefined): boolean {
  return !!mime && (mime.startsWith("audio/") || mime.startsWith("video/"));
}

/** A file is accepted if its extension is known or the browser says it is audio/video. */
export function isAllowedFile(fileName: string | null | undefined, mime?: string | null): boolean {
  return ALLOWED_EXTENSIONS.includes(extensionOf(fileName)) || isMediaMime(mime);
}

/** "audio" | "video" — by extension first, MIME as a fallback, video as the last resort (ffmpeg strips video anyway). */
export function mediaKind(fileName: string, mime?: string | null): "audio" | "video" {
  const ext = extensionOf(fileName);
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return "audio";
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(ext)) return "video";
  return mime?.startsWith("audio/") ? "audio" : "video";
}
