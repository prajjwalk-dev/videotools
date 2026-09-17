"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { FiAlertCircle, FiFilm, FiGlobe, FiMic, FiUpload } from "react-icons/fi";
import { useToast } from "@/components/Toast";
import { Eyebrow, ProgressBar } from "@/components/ui";
import { uploadFile, type UploadMode } from "@/lib/api-client";
import { formatBytes } from "@/lib/format";
import { extensionOf, FILE_ACCEPT, FORMAT_HINT, isAllowedFile, mediaKind } from "@/lib/formats";
import { SPOKEN_LANGUAGES, type SpokenLanguage } from "@/lib/languages";

const MAX_MB = 500;

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

export default function UploadForm({ mode }: { mode: UploadMode }) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [language, setLanguage] = useState<SpokenLanguage>("auto");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const pick = useCallback(
    (list: FileList | File[] | null | undefined) => {
      const files = list ? Array.from(list) : [];
      const candidate = files[0];
      if (!candidate) return;
      if (files.length > 1) toast.error(`Only one file at a time — using "${candidate.name}".`);
      if (!isAllowedFile(candidate.name, candidate.type)) {
        const ext = extensionOf(candidate.name);
        const message = `"${candidate.name}" is not a supported audio/video file${ext ? ` (.${ext})` : ""}. Supported: ${FORMAT_HINT}.`;
        setFileError(message);
        toast.error(message);
        return;
      }
      if (candidate.size > MAX_MB * 1024 * 1024) {
        const message = `"${candidate.name}" is ${formatBytes(candidate.size)} — larger than the ${MAX_MB} MB limit.`;
        setFileError(message);
        toast.error(message);
        return;
      }
      setFileError(null);
      setFile(candidate);
    },
    [toast],
  );

  // The whole page accepts a drop; the browser must never navigate to a dropped file.
  useEffect(() => {
    const over = (e: globalThis.DragEvent) => e.preventDefault();
    const drop = (e: globalThis.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (!uploading && e.dataTransfer?.files.length) pick(e.dataTransfer.files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [pick, uploading]);

  const dragHandlers = {
    onDragOver: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      if (uploading || !hasFiles(e)) return;
      setDragging(true);
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return; // moving between children
      setDragging(false);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      if (!uploading) pick(e.dataTransfer.files);
    },
  };

  const handleUpload = async () => {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setUploading(true);
    setProgress(0);
    setFileError(null);
    try {
      const result = await uploadFile(file, language, setProgress, controller.signal, mode);
      toast.success("Uploaded. Transcription started.");
      router.push(`/transcriptions/${result.transcription_id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      if (controller.signal.aborted) toast.error("Upload cancelled");
      else {
        setFileError(message);
        toast.error(message);
      }
      setUploading(false);
      setProgress(0);
    } finally {
      abortRef.current = null;
    }
  };

  const FileIcon = file && mediaKind(file.name, file.type) === "video" ? FiFilm : FiMic;

  return (
    <div className="pt-12 sm:pt-16">
      {/* Hero */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
        <div>
          <Eyebrow>Upload</Eyebrow>
          <h1 className="mt-3 max-w-[14ch] font-display text-[38px] leading-[1.02] font-medium tracking-[-0.02em] text-ink sm:text-[54px]">
            Drop a voice note. Get a transcript you can edit.
          </h1>
        </div>
        <p className="text-[15.5px] leading-relaxed text-ink-muted lg:pb-2">
          WhatsApp notes, reels, full YouTube uploads. Hindi and Hinglish come out as editable text plus SRT, VTT, TXT and
          JSON captions.
        </p>
      </div>

      {/* Spoken language */}
      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-[13px] font-medium tracking-[0.08em] text-ink uppercase">
          <FiGlobe className="h-4 w-4 text-ink-muted" /> Spoken language
        </p>
        <div
          role="radiogroup"
          aria-label="Spoken language"
          data-testid="spoken-language"
          className="flex w-full rounded-md border border-line bg-surface-2 p-[3px] sm:w-auto"
        >
          {(Object.entries(SPOKEN_LANGUAGES) as [SpokenLanguage, string][]).map(([code, label]) => {
            const selected = language === code;
            return (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={selected}
                data-value={code}
                disabled={uploading}
                onClick={() => setLanguage(code)}
                className={`h-8 flex-1 rounded-sm px-2 text-[13px] font-medium transition-colors sm:flex-none sm:px-3.5 sm:text-[14px] ${
                  selected ? "bg-surface text-ink ring-1 ring-line-strong" : "text-ink-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dropzone / file card */}
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose an audio or video file"
          data-testid="dropzone"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          {...dragHandlers}
          className={`mt-4 block cursor-pointer rounded-lg border px-6 py-14 text-center transition-colors focus:ring-2 focus:ring-accent/20 focus:outline-none sm:py-20 ${
            dragging
              ? "border-accent bg-accent-soft"
              : fileError
                ? "border-danger bg-surface"
                : "border-dashed border-line-strong bg-surface hover:border-ink-faint"
          }`}
        >
          <span
            className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border transition-transform ${
              dragging
                ? "scale-105 border-accent bg-accent text-white"
                : fileError
                  ? "border-danger text-danger"
                  : "border-line-strong text-ink"
            }`}
          >
            <FiUpload className="h-5 w-5" />
          </span>
          <span
            className={`mt-5 block font-display text-[26px] leading-tight sm:text-[30px] ${dragging ? "text-accent-ink" : "text-ink"}`}
          >
            {dragging ? "Release to add the file" : "Drag audio or video here"}
          </span>
          <span className="mt-2 block text-[15px] text-ink-muted">
            or{" "}
            <span className="font-medium text-accent underline decoration-accent/40 underline-offset-[3px]">browse your files</span>
          </span>
          <span className="mt-7 block font-mono text-[12px] leading-relaxed tracking-wide text-ink-muted">
            OGG · OPUS · MP3 · M4A · WAV · MP4 · MOV — up to {MAX_MB} MB
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={FILE_ACCEPT}
            className="hidden"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div
          {...dragHandlers}
          data-testid="file-card"
          className={`mt-4 rounded-lg border bg-surface p-4 transition-colors sm:p-5 ${dragging ? "border-accent" : "border-line"}`}
        >
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-ink">
              <FileIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-4">
                <p className="min-w-0 text-[15.5px] leading-snug font-medium break-words text-ink">{file.name}</p>
                {uploading ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="shrink-0 text-[14px] text-ink-muted underline decoration-line-strong underline-offset-[3px] hover:text-danger"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setFileError(null);
                      setProgress(0);
                    }}
                    className="shrink-0 text-[14px] text-ink-muted underline decoration-line-strong underline-offset-[3px] hover:text-ink"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="mt-0.5 font-mono text-[12px] text-ink-muted tabular-nums">
                {formatBytes(file.size)} · {file.type || extensionOf(file.name) || "unknown type"} · language:{" "}
                {SPOKEN_LANGUAGES[language].toLowerCase()}
              </p>
              {uploading && (
                <div className="mt-4">
                  <ProgressBar value={progress} />
                  <div className="mt-2 flex justify-between font-mono text-[12px] text-ink-muted tabular-nums">
                    <span>{progress < 100 ? `Uploading · ${progress}%` : "Finalising…"}</span>
                    <span>
                      {formatBytes((file.size * progress) / 100)} of {formatBytes(file.size)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {fileError && (
        <div
          role="alert"
          className="mt-3 flex gap-2.5 rounded-md border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[14px] leading-snug text-danger"
        >
          <FiAlertCircle className="mt-[3px] h-4 w-4 shrink-0" />
          <span>{fileError}</span>
        </div>
      )}

      {file && !uploading && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[14px] text-ink-muted">
            Transcribe as <span className="font-medium text-ink">{SPOKEN_LANGUAGES[language]}</span>. You choose the output script
            on the next page.
          </p>
          <button
            type="button"
            onClick={handleUpload}
            data-testid="upload-button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-[14.5px] font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <FiUpload className="h-4 w-4" /> Upload and transcribe
          </button>
        </div>
      )}

      {/* How it works */}
      <section className="mt-16 sm:mt-20">
        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
          <Eyebrow>How it works</Eyebrow>
          <span className="hidden font-mono text-[12px] text-ink-muted sm:inline">Usually under a minute for a 5-minute note</span>
        </div>
        <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            ["Upload", "Drop the file and say what language is spoken, or let it detect. Video is fine; only the audio is used."],
            ["We transcribe", "Speech becomes text aligned to timestamps. Follow progress and stage from the Transcriptions page."],
            ["Edit & export", "Fix any line, choose Roman or Devanagari (or both), and download captions cut for reels or YouTube."],
          ].map(([title, body], i) => (
            <div key={title} className={`py-7 ${i === 0 ? "sm:pr-8" : i === 1 ? "sm:px-8" : "sm:pl-8"}`}>
              <span className="font-display text-[40px] leading-none text-ink-faint italic">{i + 1}</span>
              <h3 className="mt-4 text-[16px] font-medium text-ink">{title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
