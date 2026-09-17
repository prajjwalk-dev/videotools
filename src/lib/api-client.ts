// Browser-side wrappers for the API routes.

import type { CaptionFormat, SegmentDto, StatusDto, TranscriptionDetail, TranscriptionListItem, VariantSummary } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export interface UploadResponse {
  message: string;
  file_id: string;
  transcription_id: string;
}

const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

const STATUS_MESSAGES: Record<number, string> = {
  413: "File is too large for the server",
  502: "Server is unavailable right now, please try again",
  503: "Server is unavailable right now, please try again",
  504: "Server took too long to respond, please try again",
};

/** Uses XHR so we can report upload progress and abort. */
export function uploadFile(
  file: File,
  language: string,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("language", language);
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/upload");
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { error?: string } & Partial<UploadResponse> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        if (!body.transcription_id) return reject(new Error("Unexpected response from the server"));
        return resolve(body as UploadResponse);
      }
      reject(new Error(body.error ?? STATUS_MESSAGES[xhr.status] ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload — check your connection and try again"));
    xhr.ontimeout = () => reject(new Error("Upload timed out — check your connection and try again"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

export const api = {
  listTranscriptions: () => request<TranscriptionListItem[]>("/api/transcriptions"),
  getTranscription: (id: string) => request<TranscriptionDetail>(`/api/transcriptions/${id}`),
  getStatus: (id: string) => request<StatusDto>(`/api/transcriptions/${id}/status`),
  deleteTranscription: (id: string) => request<{ message: string }>(`/api/transcriptions/${id}`, { method: "DELETE" }),
  retryTranscription: (id: string) => request<{ message: string }>(`/api/transcriptions/${id}/retry`, { method: "POST" }),
  regenerateCaptions: (id: string) => request<{ message: string }>(`/api/transcriptions/${id}/regenerate`, { method: "POST" }),
  generateVariant: (id: string, script: string) =>
    request<VariantSummary>(`/api/transcriptions/${id}/variants`, { method: "POST", body: JSON.stringify({ script }) }),
  updateSegment: (id: string, segmentId: string, data: { text?: string; startTime?: number; endTime?: number }) =>
    request<SegmentDto>(`/api/transcriptions/${id}/segments/${segmentId}`, { method: "PATCH", body: JSON.stringify(data) }),
  exportUrl: (id: string, format: CaptionFormat, script: string, wordsPerLine = 0) =>
    `/api/transcriptions/${id}/export?format=${format}&script=${encodeURIComponent(script)}&download=true${
      wordsPerLine > 0 ? `&wordsPerLine=${wordsPerLine}` : ""
    }`,
};
