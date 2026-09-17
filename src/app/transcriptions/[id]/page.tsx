"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheck,
  FiChevronDown,
  FiClock,
  FiCopy,
  FiDownload,
  FiEdit2,
  FiFileText,
  FiFilm,
  FiLoader,
  FiMic,
  FiRefreshCw,
  FiTrash2,
  FiType,
} from "react-icons/fi";
import { useToast } from "@/components/Toast";
import { button, Eyebrow, ProgressBar, Section, StatusChip, SubLabel } from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatBytes, formatClock, formatDate, formatDuration } from "@/lib/format";
import { BILINGUAL, scriptLabel, scriptShort, SCRIPT_LABELS, SPOKEN_LANGUAGES } from "@/lib/languages";
import { CAPTION_FORMATS, type SegmentDto, type TranscriptionDetail, type VariantDto } from "@/lib/types";

const POLL_MS = 2000;
const PREVIEW_CHARS = 900;
const SEGMENT_PAGE = 30;
const WORDS_PER_LINE_OPTIONS = [
  { value: 0, label: "Original segments" },
  { value: 3, label: "3 · Reels & Shorts" },
  { value: 4, label: "4 · Reels & Shorts" },
  { value: 6, label: "6 · Reels & Shorts" },
  { value: 10, label: "10 · YouTube" },
  { value: 12, label: "12 · YouTube" },
];

// Rough map of pipeline progress -> stage list shown while transcribing.
const STAGES = [
  { label: "Extract audio", at: 25 },
  { label: "Transcribe", at: 88 },
  { label: "Save", at: 94 },
  { label: "Captions", at: 100 },
];

export default function TranscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<TranscriptionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [wordsPerLine, setWordsPerLine] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [visibleSegments, setVisibleSegments] = useState(SEGMENT_PAGE);
  const [copied, setCopied] = useState(false);

  const load = useCallback(
    () =>
      api
        .getTranscription(id)
        .then((detail) => {
          setData(detail);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load transcription")),
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  // The output script defaults to the primary one until the user picks another.
  const selected = choice ?? data?.primaryScript ?? null;

  const variants = useMemo(() => {
    const map: Record<string, VariantDto> = {};
    for (const v of data?.variants ?? []) map[v.script] = v;
    return map;
  }, [data]);
  const primary = data?.variants.find((v) => v.isPrimary) ?? null;

  const jobBusy = data?.status === "pending" || data?.status === "processing";
  const variantBusy = data?.variants.some((v) => v.status === "pending" || v.status === "processing") ?? false;
  useEffect(() => {
    if (!jobBusy && !variantBusy) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [jobBusy, variantBusy, load]);

  // Which scripts the current selection needs, and whether they are all ready.
  const neededScripts = selected === BILINGUAL ? ["hi", "hi-en"] : selected ? [selected] : [];
  const neededVariants = neededScripts.map((s) => variants[s]);
  const ready = neededVariants.length > 0 && neededVariants.every((v) => v?.status === "completed");
  const generating = neededVariants.some((v) => !v || v.status === "pending" || v.status === "processing");
  const failedVariant = neededVariants.find((v) => v?.status === "failed");
  const generatingScript = neededScripts.find((s) => !variants[s] || variants[s].status !== "completed");

  const options = useMemo(() => {
    if (!data) return [];
    const list = [...data.outputOptions];
    if (data.supportsBilingual) list.push(BILINGUAL);
    return list;
  }, [data]);

  const chooseScript = async (key: string) => {
    const previous = selected;
    setChoice(key);
    setShowFull(false);
    setVisibleSegments(SEGMENT_PAGE);
    const needed = key === BILINGUAL ? ["hi", "hi-en"] : [key];
    const missing = needed.filter((s) => !variants[s] || variants[s].status === "failed");
    for (const script of missing) {
      try {
        await api.generateVariant(id, script);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not start conversion");
        setChoice(previous); // do not leave the control stuck on "Generating…"
        return;
      }
    }
    if (missing.length) await load();
  };

  const run = async (action: () => Promise<unknown>, successMessage?: string) => {
    setBusy(true);
    try {
      await action();
      if (successMessage) toast.success(successMessage);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteTranscription(id);
      toast.success("Deleted");
      router.push("/transcriptions");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const saveSegments = async (edits: { segmentId: string; text: string }[]) => {
    for (const e of edits) await api.updateSegment(id, e.segmentId, { text: e.text });
    await load();
    toast.success("Segment updated");
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };

  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className="pt-12">
        <Link href="/transcriptions" className={button.quiet}>
          <FiArrowLeft className="h-4 w-4" /> Transcriptions
        </Link>
        <div
          role="alert"
          className="mt-6 flex gap-2.5 rounded-md border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger"
        >
          <FiAlertCircle className="mt-[3px] h-4 w-4 shrink-0" /> {error}
        </div>
      </div>
    );
  }
  if (!data) return <p className="py-24 text-center font-mono text-[12px] text-ink-muted">Loading…</p>;

  const FileIcon = data.fileType === "video" ? FiFilm : FiMic;
  const title = data.fileName.replace(/\.[^.]+$/, "");
  const spokenLabel =
    data.spokenLanguage === "auto"
      ? data.detectedLanguage
        ? `${scriptShort(data.detectedLanguage)} (detected)`
        : "Auto-detect"
      : SPOKEN_LANGUAGES[data.spokenLanguage];

  // Text + segments to display for the current selection (falls back to the primary while generating).
  const displayVariants: VariantDto[] = ready
    ? (neededVariants as VariantDto[])
    : primary
      ? [primary]
      : [];
  const isBilingualView = ready && selected === BILINGUAL;
  const displayText = displayVariants.map((v) => v.fullText ?? "").join("\n\n");
  const rowCount = displayVariants[0]?.segments.length ?? 0;

  return (
    <div className="pt-8 sm:pt-10">
      <Link href="/transcriptions" className={button.quiet}>
        <FiArrowLeft className="h-4 w-4" /> Transcriptions
      </Link>

      {/* Header */}
      <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Eyebrow className="flex items-center gap-2">
            <FileIcon className="h-3.5 w-3.5" /> {data.fileType === "video" ? "Video" : "Voice note"} · {data.mediaFile.fileFormat}
          </Eyebrow>
          <h1 className="mt-3 font-display text-[28px] leading-[1.1] font-medium tracking-[-0.02em] break-words text-ink sm:text-[36px]">
            {title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-muted">
            <StatusChip status={data.status} />
            <span>
              Uploaded {formatDate(data.createdAt)}
              {data.processingCompletedAt ? ` · ready at ${new Date(data.processingCompletedAt).toLocaleTimeString()}` : ""}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {data.status === "failed" && (
            <button onClick={() => run(() => api.retryTranscription(id))} disabled={busy} className={button.secondary}>
              <FiRefreshCw className="h-4 w-4 text-ink-muted" /> Retry
            </button>
          )}
          {confirmDelete ? (
            <span className="flex items-center gap-2 text-[13px] text-ink-muted">
              Delete this file?
              <button onClick={remove} disabled={busy} className="font-medium text-danger hover:underline">
                Yes
              </button>
              ·
              <button onClick={() => setConfirmDelete(false)} className="font-medium text-ink hover:underline">
                No
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} disabled={busy || jobBusy} className={button.dangerOutline}>
              <FiTrash2 className="h-4 w-4" /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Processing / failed panels */}
      {jobBusy && (
        <div className="mt-8 rounded-lg border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-display text-[26px] leading-none text-ink">
              {data.stage ?? (data.status === "pending" ? "Queued" : "Working…")}
            </p>
            <span className="font-mono text-[13px] text-ink-muted tabular-nums">{data.progress}%</span>
          </div>
          <ProgressBar value={data.progress} className="mt-4" />
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] tracking-[0.1em] uppercase">
            {STAGES.map((s, i) => {
              const prevAt = i === 0 ? 0 : STAGES[i - 1].at;
              const done = data.progress >= s.at;
              const current = !done && data.progress >= prevAt;
              return (
                <li
                  key={s.label}
                  className={`flex items-center gap-1 ${done ? "text-success" : current ? "text-accent-ink" : "text-ink-faint"}`}
                >
                  {done && <FiCheck className="h-3 w-3" />}
                  {s.label}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[14px] text-ink-muted">This page updates itself. Longer files are transcribed in 10-minute parts.</p>
        </div>
      )}
      {data.status === "failed" && (
        <div
          role="alert"
          className="mt-8 flex gap-2.5 rounded-md border border-danger/30 bg-danger-soft px-3.5 py-3 text-[14px] leading-snug text-danger"
        >
          <FiAlertCircle className="mt-[3px] h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">Transcription failed.</span> {data.errorMessage ?? "Unknown error"} — use Retry to run it
            again.
          </span>
        </div>
      )}

      {/* Facts */}
      <dl className="mt-8 grid grid-cols-3 gap-x-4 gap-y-6 border-y border-line py-5 sm:grid-cols-5">
        {[
          ["Duration", data.duration != null ? formatDuration(data.duration) : "—", ""],
          ["Size", formatBytes(data.fileSize).replace(/ .*/, ""), formatBytes(data.fileSize).replace(/^[\d.]+ /, "")],
          ["Spoken", spokenLabel, ""],
          ["Processed in", data.processingDuration != null ? `${Math.round(data.processingDuration)}` : "—", data.processingDuration != null ? "s" : ""],
          ["Words", displayVariants[0] ? displayVariants[0].wordCount.toLocaleString() : "—", ""],
        ].map(([dt, dd, unit], i) => (
          <div key={dt} className={`min-w-0 ${i > 0 ? "sm:border-l sm:border-line sm:pl-5" : ""}`}>
            <dt className="font-mono text-[11px] tracking-[0.12em] text-ink-muted uppercase">{dt}</dt>
            <dd className="mt-1 truncate font-display text-[22px] leading-none text-ink tabular-nums sm:text-[24px]">
              {dd}
              {unit && <span className="ml-1 text-[16px] text-ink-muted">{unit}</span>}
            </dd>
          </div>
        ))}
      </dl>

      {data.status === "completed" && primary && (
        <>
          {/* Output */}
          <Section
            icon={<FiType className="h-4 w-4" />}
            title="Output"
            helper="Same speech, written the way you will publish it. Captions follow the script you pick; a script you have not opened yet takes about a minute."
          >
            {options.length > 1 ? (
              <>
                <SubLabel>Script</SubLabel>
                <div
                  role="radiogroup"
                  aria-label="Output script"
                  data-testid="output-script"
                  className="mt-2 grid w-full grid-cols-3 rounded-md border border-line bg-surface-2 p-[3px] sm:inline-flex sm:w-auto"
                >
                  {options.map((key) => {
                    const isSelected = selected === key;
                    const isGenerating = isSelected && generating;
                    const info = key === BILINGUAL ? { short: "Both", sub: "two lines" } : { short: scriptShort(key), sub: subLabelFor(key) };
                    return (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        data-value={key}
                        disabled={generating && !isSelected}
                        onClick={() => chooseScript(key)}
                        className={`flex flex-col items-center rounded-sm px-3 py-1.5 transition-colors sm:px-5 ${
                          isSelected ? "bg-surface text-ink ring-1 ring-line-strong" : "text-ink-muted hover:text-ink"
                        } disabled:cursor-not-allowed disabled:text-ink-faint`}
                      >
                        <span className="text-[14px] leading-tight font-medium">{info.short}</span>
                        {isGenerating ? (
                          <span className="flex items-center gap-1 text-[11.5px] leading-tight text-accent">
                            <FiLoader className="h-3 w-3 animate-spin" /> Generating…
                          </span>
                        ) : (
                          <span className={`text-[11.5px] leading-tight ${isSelected ? "text-ink-muted" : ""}`}>{info.sub}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-2 text-[13px] text-ink-muted">
                  {failedVariant ? (
                    <>
                      <FiAlertCircle className="h-3.5 w-3.5 text-danger" />
                      <span className="text-danger">
                        Could not generate {scriptLabel(failedVariant.script)}: {failedVariant.errorMessage ?? "unknown error"}.
                      </span>
                      <button onClick={() => chooseScript(selected ?? primary.script)} className={button.link}>
                        Try again
                      </button>
                    </>
                  ) : generating ? (
                    <>
                      <FiLoader className="h-3.5 w-3.5 animate-spin text-accent" />
                      <span>
                        Generating the {generatingScript ? scriptLabel(generatingScript) : ""} version
                        {generatingScript && variants[generatingScript] ? ` · ${variants[generatingScript].progress}%` : ""}. The
                        transcript below stays readable in {scriptShort(primary.script)} meanwhile.
                      </span>
                    </>
                  ) : (
                    <>
                      <FiCheck className="h-3.5 w-3.5 text-success" />
                      <span>
                        {selected === BILINGUAL ? "Both scripts ready" : `${scriptLabel(selected ?? primary.script)} ready`}
                        {variants[neededScripts[0]]?.source === "converted" ? " · converted from the transcript" : ""}
                      </span>
                    </>
                  )}
                </div>
              </>
            ) : (
              <p className="text-[14px] text-ink-muted">
                Output in <span className="font-medium text-ink">{scriptLabel(primary.script)}</span> — the only script that makes
                sense for this audio.
              </p>
            )}

            <SubLabel className="mt-7">Captions</SubLabel>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {CAPTION_FORMATS.map((format) => (
                <a
                  key={format}
                  href={ready ? api.exportUrl(id, format, selected ?? primary.script, isBilingualView ? 0 : wordsPerLine) : undefined}
                  aria-disabled={!ready}
                  className={`${button.secondarySmall} ${!ready ? "pointer-events-none opacity-50" : ""}`}
                >
                  <FiDownload className="h-4 w-4 text-ink-muted" /> {format.toUpperCase()}
                </a>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-[14px]">
              {!isBilingualView && (
                <label className="flex items-center gap-3">
                  <span className="text-ink-muted">Words per line</span>
                  <span className="relative inline-flex">
                    <select
                      value={wordsPerLine}
                      onChange={(e) => setWordsPerLine(Number(e.target.value))}
                      className="h-9 appearance-none rounded-md border border-line-strong bg-surface pr-9 pl-3 text-[14px] font-medium text-ink focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                    >
                      {WORDS_PER_LINE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  </span>
                </label>
              )}
              <button onClick={() => run(() => api.regenerateCaptions(id), "Captions regenerated")} disabled={busy} className={button.link}>
                <FiRefreshCw className="h-3.5 w-3.5" /> Regenerate captions
              </button>
              <span className="font-mono text-[12px] text-ink-muted">
                {isBilingualView ? "two lines per cue · Devanagari over Roman" : "re-splits cues for reels or YouTube · your edits are kept"}
              </span>
            </div>
          </Section>

          {/* Transcript */}
          <Section
            icon={<FiFileText className="h-4 w-4" />}
            title="Transcript"
            helper={
              displayVariants[0]?.corrected
                ? "Spelling was checked by AI after transcription; open a segment to see what Whisper heard. Edits below update this text."
                : "Read it through once before exporting. Edits to segments below update this text."
            }
            aside={
              <button onClick={() => copyText(displayText)} className={button.quiet}>
                {copied ? <FiCheck className="h-4 w-4 text-success" /> : <FiCopy className="h-4 w-4" />} {copied ? "Copied" : "Copy text"}
              </button>
            }
          >
            {displayVariants.map((v, i) => {
              const full = v.fullText ?? "";
              const truncated = !showFull && full.length > PREVIEW_CHARS;
              const text = truncated ? `${full.slice(0, PREVIEW_CHARS).replace(/\s+\S*$/, "")}…` : full;
              const devanagari = v.script === "hi";
              return (
                <div key={v.script} className={i > 0 ? "mt-8" : ""}>
                  {isBilingualView && <SubLabel>{devanagari ? "Devanagari" : "Roman"}</SubLabel>}
                  <p
                    lang={devanagari ? "hi" : undefined}
                    className={`mt-3 max-w-[64ch] font-reading ${
                      isBilingualView && !devanagari ? "text-[18px] leading-[1.65] text-ink-muted" : "text-[20px] leading-[1.7] text-ink"
                    }`}
                  >
                    {text || <span className="text-ink-muted italic">No speech was recognised.</span>}
                  </p>
                </div>
              );
            })}
            {displayVariants.some((v) => (v.fullText?.length ?? 0) > PREVIEW_CHARS) && (
              <div className="mt-5 flex items-center gap-4">
                <button onClick={() => setShowFull((s) => !s)} className={button.secondarySmall}>
                  {showFull ? "Show less" : "Show full transcript"}
                  <span className="font-mono text-[12px] text-ink-muted">{displayVariants[0].wordCount.toLocaleString()} words</span>
                </button>
              </div>
            )}
          </Section>

          {/* Segments */}
          <Section
            icon={<FiClock className="h-4 w-4" />}
            title={
              <>
                Segments <span className="ml-1 font-mono text-[12px] font-normal tracking-normal text-ink-muted normal-case">{rowCount}</span>
              </>
            }
            helper={
              isBilingualView
                ? "Each line becomes a caption. Use the pencil to fix a line; timestamps stay put. In Both mode you edit each script separately."
                : "Each line becomes a caption. Use the pencil to fix a line; timestamps stay put."
            }
          >
            <div className="min-w-0 divide-y divide-line border-t border-line">
              {(displayVariants[0]?.segments ?? []).slice(0, visibleSegments).map((seg, i) => (
                <SegmentRow
                  key={seg.id}
                  primary={{ segment: seg, devanagari: displayVariants[0].script === "hi", label: isBilingualView ? "Devanagari" : undefined }}
                  secondary={
                    isBilingualView && displayVariants[1]?.segments[i]
                      ? { segment: displayVariants[1].segments[i], devanagari: displayVariants[1].script === "hi", label: "Roman" }
                      : undefined
                  }
                  onSave={saveSegments}
                />
              ))}
            </div>
            {rowCount > visibleSegments && (
              <div className="mt-5 flex items-center justify-between gap-4">
                <span className="font-mono text-[12px] text-ink-muted">
                  1–{Math.min(visibleSegments, rowCount)} of {rowCount} segments
                </span>
                <button onClick={() => setVisibleSegments((n) => n + SEGMENT_PAGE)} className={button.secondarySmall}>
                  Show more
                </button>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function subLabelFor(script: string): string {
  if (script === "hi-en") return "Roman";
  if (script === "hi") return "Devanagari";
  return SCRIPT_LABELS[script]?.native ?? "";
}

interface Line {
  segment: SegmentDto;
  devanagari: boolean;
  label?: string;
}

function SegmentRow({
  primary,
  secondary,
  onSave,
}: {
  primary: Line;
  secondary?: Line;
  onSave: (edits: { segmentId: string; text: string }[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text1, setText1] = useState(primary.segment.text);
  const [text2, setText2] = useState(secondary?.segment.text ?? "");
  const [saving, setSaving] = useState(false);
  const firstRef = useRef<HTMLTextAreaElement>(null);
  const pencilRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const toast = useToast();

  useEffect(() => {
    if (editing) {
      const el = firstRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    } else if (wasEditing.current) {
      pencilRef.current?.focus(); // keyboard users land back on the row they edited
    }
    wasEditing.current = editing;
  }, [editing]);

  const start = () => {
    setText1(primary.segment.text);
    setText2(secondary?.segment.text ?? "");
    setEditing(true);
  };

  const save = async () => {
    if (saving) return;
    const edits: { segmentId: string; text: string }[] = [];
    if (!text1.trim() || (secondary && !text2.trim())) {
      toast.error("A segment cannot be empty");
      return;
    }
    if (text1.trim() !== primary.segment.text) edits.push({ segmentId: primary.segment.id, text: text1.trim() });
    if (secondary && text2.trim() !== secondary.segment.text) edits.push({ segmentId: secondary.segment.id, text: text2.trim() });
    if (edits.length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(edits);
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  };

  const timestamp = (
    <span className="font-mono text-[12px] text-ink-muted tabular-nums md:pt-[7px]">
      {formatClock(primary.segment.startTime)} <span className="text-ink-faint">→</span> {formatClock(primary.segment.endTime)}
    </span>
  );

  if (editing) {
    return (
      <div className="-ml-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-3 border-l-2 border-l-accent bg-surface py-5 pr-4 pl-4 md:ml-0 md:grid-cols-[150px_minmax(0,1fr)] md:pr-5 md:pl-5">
        <button ref={pencilRef} className="sr-only" tabIndex={-1} aria-hidden="true" />
        {timestamp}
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.12em] text-accent uppercase md:hidden">
          <FiEdit2 className="h-3 w-3" /> Editing
        </span>
        <div className="col-span-2 min-w-0 md:col-span-1">
          {primary.label && <SubLabel>{primary.label}</SubLabel>}
          <textarea
            ref={firstRef}
            value={text1}
            onChange={(e) => setText1(e.target.value)}
            onKeyDown={onKey}
            rows={2}
            disabled={saving}
            lang={primary.devanagari ? "hi" : undefined}
            className="mt-1.5 block min-h-[5.5rem] w-full resize-y rounded-md border border-accent bg-paper px-3.5 py-2.5 font-reading text-[19px] leading-[1.65] text-ink ring-2 ring-accent/15 field-sizing-content focus:outline-none disabled:opacity-60"
          />
          {primary.segment.rawText && (
            <p className="mt-1.5 font-mono text-[12px] text-ink-muted">
              Whisper heard: <span className="text-ink">{primary.segment.rawText}</span>
            </p>
          )}
          {secondary && (
            <>
              <SubLabel className="mt-4">{secondary.label}</SubLabel>
              <textarea
                value={text2}
                onChange={(e) => setText2(e.target.value)}
                onKeyDown={onKey}
                rows={2}
                disabled={saving}
                lang={secondary.devanagari ? "hi" : undefined}
                className="mt-1.5 block min-h-[5rem] w-full resize-y rounded-md border border-line-strong bg-paper px-3.5 py-2.5 font-reading text-[17px] leading-[1.6] text-ink field-sizing-content focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none disabled:opacity-60"
              />
            </>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button onClick={save} disabled={saving} className={button.primarySmall}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="inline-flex h-9 items-center justify-center px-2 text-[14px] font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <span className="ml-auto hidden font-mono text-[11px] text-ink-muted sm:inline">Ctrl + Enter to save · Esc to cancel</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 py-5 md:grid-cols-[150px_minmax(0,1fr)_36px]">
      {timestamp}
      <button
        ref={pencilRef}
        onClick={start}
        className="order-2 -mt-2 -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:order-3 md:-mt-1 md:mr-0 md:justify-self-end"
        aria-label="Edit segment"
        title="Edit"
      >
        <FiEdit2 className="h-4 w-4" />
      </button>
      <div className="order-3 col-span-2 min-w-0 md:order-2 md:col-span-1">
        <p lang={primary.devanagari ? "hi" : undefined} className="font-reading text-[19px] leading-[1.65] text-ink">
          {primary.segment.text}
        </p>
        {secondary && (
          <p lang={secondary.devanagari ? "hi" : undefined} className="mt-1 font-reading text-[16.5px] leading-[1.6] text-ink-muted">
            {secondary.segment.text}
          </p>
        )}
      </div>
    </div>
  );
}
