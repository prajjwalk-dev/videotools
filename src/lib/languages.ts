// Spoken-language choices, output scripts and the "smart" rules linking them. Client-safe.

export const SPOKEN_LANGUAGES = {
  auto: "Auto-detect",
  "hi-en": "Hinglish",
  hi: "Hindi",
  en: "English",
} as const;
export type SpokenLanguage = keyof typeof SPOKEN_LANGUAGES;
export const SPOKEN_LANGUAGE_CODES = Object.keys(SPOKEN_LANGUAGES) as SpokenLanguage[];

/** Output scripts we can name nicely. Anything else is shown by its code. */
export const SCRIPT_LABELS: Record<string, { label: string; short: string; native?: string }> = {
  "hi-en": { label: "Hinglish (Roman)", short: "Hinglish" },
  hi: { label: "Hindi (Devanagari)", short: "Hindi", native: "हिंदी" },
  en: { label: "English", short: "English" },
  ur: { label: "Urdu", short: "Urdu", native: "اردو" },
  pa: { label: "Punjabi", short: "Punjabi" },
  mr: { label: "Marathi", short: "Marathi" },
  gu: { label: "Gujarati", short: "Gujarati" },
  bn: { label: "Bengali", short: "Bengali" },
  ta: { label: "Tamil", short: "Tamil" },
  te: { label: "Telugu", short: "Telugu" },
  kn: { label: "Kannada", short: "Kannada" },
  ml: { label: "Malayalam", short: "Malayalam" },
};

export function scriptLabel(script: string): string {
  return SCRIPT_LABELS[script]?.label ?? script.toUpperCase();
}
export function scriptShort(script: string): string {
  return SCRIPT_LABELS[script]?.short ?? script.toUpperCase();
}

/** Hindi / Hinglish / Urdu speech is the same spoken language in different scripts. */
export function isHindustani(script: string): boolean {
  return script === "hi" || script === "hi-en" || script === "ur";
}

/**
 * Which output scripts make sense for a transcript whose primary script is `primary`.
 * Hindi-family speech can be shown in Devanagari, Roman Hinglish, or both; anything else is itself only.
 */
export function outputOptions(primary: string): string[] {
  if (!isHindustani(primary)) return [primary];
  const options = ["hi-en", "hi"];
  if (primary === "ur") options.push("ur");
  return options;
}

/** Whether a "Both" (bilingual) view/export is offered. */
export function supportsBilingual(primary: string): boolean {
  return isHindustani(primary);
}

export const BILINGUAL = "both";

/** Whisper reports a language name ("Hindi") or a code; normalise to a short code. */
const WHISPER_LANGUAGE_CODES: Record<string, string> = {
  english: "en", hindi: "hi", urdu: "ur", punjabi: "pa", marathi: "mr", gujarati: "gu", bengali: "bn",
  tamil: "ta", telugu: "te", kannada: "kn", malayalam: "ml", nepali: "ne", sindhi: "sd", sanskrit: "sa",
  arabic: "ar", spanish: "es", french: "fr", german: "de", portuguese: "pt", italian: "it", russian: "ru",
  chinese: "zh", japanese: "ja", korean: "ko", indonesian: "id", malay: "ms", turkish: "tr", persian: "fa",
  dutch: "nl", polish: "pl", swedish: "sv", vietnamese: "vi", thai: "th", tagalog: "tl", swahili: "sw",
};
export function normaliseLanguageCode(raw: string | undefined | null): string {
  if (!raw) return "unknown";
  const key = raw.trim().toLowerCase();
  if (WHISPER_LANGUAGE_CODES[key]) return WHISPER_LANGUAGE_CODES[key];
  if (/^[a-z]{2,3}(-[a-z]{2,4})?$/.test(key)) return key;
  return key;
}
