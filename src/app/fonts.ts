import { IBM_Plex_Mono, Mukta, Newsreader, Tiro_Devanagari_Hindi } from "next/font/google";

// Display + Latin reading serif.
export const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});

// Devanagari reading serif; sits after Newsreader in the same stack so mixed lines read as one serif.
export const tiro = Tiro_Devanagari_Hindi({
  subsets: ["devanagari", "latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-tiro",
  display: "swap",
});

// UI sans with Latin + Devanagari coverage.
export const mukta = Mukta({
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "600"],
  variable: "--font-mukta",
  display: "swap",
});

// Timestamps, sizes, eyebrow labels.
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});
