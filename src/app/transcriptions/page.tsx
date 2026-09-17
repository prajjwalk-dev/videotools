"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FiFileText, FiFilm, FiMic, FiRefreshCw, FiTrash2, FiUpload } from "react-icons/fi";
import { useToast } from "@/components/Toast";
import { button, Eyebrow, LanguageChip, ProgressBar, StatusChip } from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import type { TranscriptionListItem } from "@/lib/types";

const POLL_MS = 3000;

export default function TranscriptionsPage() {
  const toast = useToast();
  const [items, setItems] = useState<TranscriptionListItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api
        .listTranscriptions()
        .then(setItems)
        .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load transcriptions")),
    [toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  const inProgress = items?.some((t) => t.status === "pending" || t.status === "processing") ?? false;
  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [inProgress, load]);

  const remove = async (item: TranscriptionListItem) => {
    setBusyId(item.id);
    try {
      await api.deleteTranscription(item.id);
      setItems((list) => list?.filter((t) => t.id !== item.id) ?? null);
      toast.success("Deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  const retry = async (item: TranscriptionListItem) => {
    setBusyId(item.id);
    try {
      await api.retryTranscription(item.id);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed");
    } finally {
      setBusyId(null);
    }
  };

  const counts = items
    ? {
        processing: items.filter((t) => t.status === "processing").length,
        queued: items.filter((t) => t.status === "pending").length,
        failed: items.filter((t) => t.status === "failed").length,
      }
    : null;

  return (
    <div className="pt-12 sm:pt-16">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow>Library</Eyebrow>
          <h1 className="mt-3 font-display text-[38px] leading-none font-medium tracking-[-0.02em] text-ink sm:text-[48px]">
            Transcriptions
          </h1>
          {items && counts && (
            <p className="mt-3 text-[14.5px] text-ink-muted">
              {items.length} {items.length === 1 ? "file" : "files"}
              {counts.processing ? ` · ${counts.processing} transcribing` : ""}
              {counts.queued ? ` · ${counts.queued} queued` : ""}
              {counts.failed ? ` · ${counts.failed} failed` : ""}
            </p>
          )}
        </div>
        <Link href="/upload" className={button.primary}>
          <FiUpload className="h-4 w-4" /> Upload a file
        </Link>
      </div>

      <div className="mt-8">
        {items === null ? (
          <p className="py-16 text-center font-mono text-[12px] text-ink-muted">Loading…</p>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong px-6 py-16 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-line-strong text-ink">
              <FiFileText className="h-5 w-5" />
            </span>
            <h2 className="mt-5 font-display text-[28px] leading-tight text-ink">Nothing transcribed yet</h2>
            <p className="mx-auto mt-2 max-w-[40ch] text-[15px] text-ink-muted">
              Upload a voice note, a reel or a full video. It will appear here with its progress.
            </p>
            <Link href="/upload" className={`${button.primary} mt-6`}>
              <FiUpload className="h-4 w-4" /> Upload your first file
            </Link>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[40px_minmax(0,1fr)_120px_296px_84px] gap-x-6 border-b border-line pb-2.5 font-mono text-[11px] tracking-[0.12em] text-ink-muted uppercase md:grid">
              <span />
              <span>File</span>
              <span>Language</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-line border-t border-line md:border-t-0">
              {items.map((item) => {
                const Icon = item.fileType === "video" ? FiFilm : FiMic;
                const busy = busyId === item.id;
                return (
                  <li
                    key={item.id}
                    className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 py-5 md:grid-cols-[40px_minmax(0,1fr)_120px_296px_84px] md:items-center md:gap-x-6"
                  >
                    <span className="row-span-2 flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink md:row-span-1">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/transcriptions/${item.id}`}
                        className="block text-[15.5px] leading-snug font-medium break-words text-ink line-clamp-2 hover:text-accent md:line-clamp-1"
                      >
                        {item.fileName}
                      </Link>
                      <p className="mt-0.5 font-mono text-[12px] text-ink-muted tabular-nums">
                        {formatBytes(item.fileSize)} · {item.duration != null ? formatDuration(item.duration) : "—"} ·{" "}
                        {formatDate(item.createdAt)}
                      </p>
                    </div>

                    <div className="-mr-2 flex items-center justify-end gap-0.5 md:order-last">
                      {confirmId === item.id ? (
                        <span className="flex items-center gap-2 text-[13px] text-ink-muted">
                          Delete?
                          <button onClick={() => remove(item)} disabled={busy} className="font-medium text-danger hover:underline">
                            Yes
                          </button>
                          ·
                          <button onClick={() => setConfirmId(null)} className="font-medium text-ink hover:underline">
                            No
                          </button>
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => retry(item)}
                            disabled={busy || item.status === "processing" || item.status === "pending"}
                            className={item.status === "failed" ? button.iconAccent : button.icon}
                            title="Retry"
                            aria-label="Retry"
                          >
                            <FiRefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                          </button>
                          <button
                            onClick={() => setConfirmId(item.id)}
                            disabled={busy || item.status === "processing"}
                            className={button.iconDanger}
                            title="Delete"
                            aria-label="Delete"
                          >
                            <FiTrash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>

                    <div className="col-span-2 col-start-2 flex flex-wrap items-center gap-x-4 gap-y-2 md:contents">
                      <div className="md:justify-self-start">
                        <LanguageChip spoken={item.spokenLanguage} detected={item.detectedLanguage} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5">
                          <StatusChip status={item.status} />
                          {item.status === "completed" && (
                            <span className="text-[13px] text-ink-muted">{item.wordCount.toLocaleString()} words</span>
                          )}
                          {item.status === "processing" && (
                            <span className="truncate text-[13px] text-ink-muted">
                              {item.progress}%{item.stage ? ` · ${item.stage}` : ""}
                            </span>
                          )}
                          {item.status === "pending" && <span className="text-[13px] text-ink-muted">Starting…</span>}
                          {item.status === "failed" && (
                            <span className="truncate text-[13px] text-danger" title={item.errorMessage ?? undefined}>
                              {item.errorMessage ?? "Unknown error"}
                            </span>
                          )}
                        </div>
                        {item.status === "processing" && <ProgressBar value={item.progress} className="mt-2 max-w-[296px]" />}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 font-mono text-[12px] text-ink-muted">
              Showing all {items.length} · newest first{inProgress ? " · refreshes while transcribing" : ""}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
