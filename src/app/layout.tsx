import type { Metadata } from "next";
import Masthead from "@/components/Masthead";
import { ToastProvider } from "@/components/Toast";
import { mukta, newsreader, plexMono, tiro } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auto Transcribe",
  description: "Upload a voice note, reel or video and get an editable transcript with captions in Hindi, Hinglish or English.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${tiro.variable} ${mukta.variable} ${plexMono.variable} h-full`}>
      <body className="flex min-h-full flex-col font-sans">
        <ToastProvider>
          <Masthead />
          <main className="mx-auto w-full max-w-[1040px] flex-1 px-4 sm:px-6 lg:px-8">{children}</main>
          <footer className="mt-20 border-t border-line sm:mt-28">
            <div className="mx-auto flex w-full max-w-[1040px] justify-between px-4 py-6 font-mono text-[12px] text-ink-muted sm:px-6 lg:px-8">
              <span>Auto Transcribe — self-hosted</span>
              <span>Hindi · Hinglish · English</span>
            </div>
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
