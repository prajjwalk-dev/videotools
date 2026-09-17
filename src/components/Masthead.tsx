"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { name: "Upload", href: "/upload" },
  { name: "Transcriptions", href: "/transcriptions" },
];

export default function Masthead() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-16 w-full max-w-[1040px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/upload" className="flex items-baseline gap-1.5 font-display text-[22px] leading-none text-ink">
          <em className="font-normal italic">Auto</em>
          <span className="font-medium tracking-[-0.01em]">Transcribe</span>
        </Link>
        <nav className="flex items-center gap-6 text-[14px] font-medium" aria-label="Main">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`border-b pb-px transition-colors ${
                isActive(l.href) ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {l.name}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
