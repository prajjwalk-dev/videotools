// Small presentational pieces shared by the pages: chips, buttons, progress bar, eyebrow labels.

import type { ReactNode } from "react";
import { FiAlertCircle, FiCheckCircle, FiClock, FiLoader } from "react-icons/fi";
import { scriptShort, SPOKEN_LANGUAGES, type SpokenLanguage } from "@/lib/languages";
import type { JobStatus } from "@/lib/types";

export const button = {
  primary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-[14.5px] font-medium text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
  primarySmall:
    "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3.5 text-[14px] font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-3.5 text-[14.5px] font-medium text-ink transition-colors hover:border-ink-faint hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
  secondarySmall:
    "inline-flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink transition-colors hover:border-ink-faint hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
  dangerOutline:
    "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-danger/30 px-3.5 text-[14.5px] font-medium text-danger transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50",
  link: "inline-flex items-center gap-1.5 text-[14px] font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:text-accent-hover hover:decoration-accent",
  quiet: "inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink",
  icon: "inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:bg-transparent",
  iconDanger:
    "inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:bg-transparent",
  iconAccent: "inline-flex h-9 w-9 items-center justify-center rounded-md text-accent transition-colors hover:bg-accent-soft",
};

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-mono text-[12px] tracking-[0.14em] text-ink-muted uppercase ${className}`}>{children}</p>;
}

export function SubLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-mono text-[11px] tracking-[0.12em] text-ink-muted uppercase ${className}`}>{children}</p>;
}

const STATUS: Record<JobStatus, { label: string; className: string; icon: typeof FiClock; spin?: boolean }> = {
  pending: { label: "Queued", className: "border border-line bg-surface-2 text-ink-muted", icon: FiClock },
  processing: { label: "Transcribing", className: "bg-accent-soft text-accent-ink", icon: FiLoader, spin: true },
  completed: { label: "Completed", className: "bg-success-soft text-success", icon: FiCheckCircle },
  failed: { label: "Failed", className: "bg-danger-soft text-danger", icon: FiAlertCircle },
};

export function StatusChip({ status, label }: { status: JobStatus; label?: string }) {
  const s = STATUS[status] ?? STATUS.pending;
  const Icon = s.icon;
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium ${s.className}`}>
      <Icon className={`h-3.5 w-3.5 ${s.spin ? "animate-spin" : ""}`} />
      {label ?? s.label}
    </span>
  );
}

/** Spoken-language chip: "HINDI", "HINGLISH", "AUTO" (or the detected language once known). */
export function LanguageChip({ spoken, detected }: { spoken: SpokenLanguage; detected: string | null }) {
  const auto = spoken === "auto";
  const text = auto ? (detected ? `Auto · ${scriptShort(detected)}` : "Auto") : SPOKEN_LANGUAGES[spoken];
  return (
    <span
      className={`inline-flex h-6 items-center rounded-sm border px-2 font-mono text-[11px] tracking-[0.1em] uppercase ${
        auto && !detected ? "border-line text-ink-muted" : "border-line-strong text-ink"
      }`}
    >
      {text}
    </span>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div
      className={`h-[3px] overflow-hidden rounded-full bg-surface-2 ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${value}%` }} />
    </div>
  );
}

/** Margin-note section used on the detail page: label + helper on the left, content on the right. */
export function Section({
  icon,
  title,
  helper,
  children,
  aside,
}: {
  icon: ReactNode;
  title: ReactNode;
  helper?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line pt-7 pb-7 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-x-12">
      <div className="mb-5 lg:mb-0">
        <h2 className="flex items-center gap-2 text-[13px] font-medium tracking-[0.08em] text-ink uppercase">
          <span className="text-ink-muted">{icon}</span>
          {title}
        </h2>
        {helper && <p className="mt-2 text-[14px] leading-relaxed text-ink-muted lg:pr-4">{helper}</p>}
        {aside && <div className="mt-4">{aside}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
