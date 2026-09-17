// Speech-to-text via Groq's hosted whisper-large-v3, plus script helpers.

import fs from "node:fs";
import Groq from "groq-sdk";
import Sanscript from "@indic-transliteration/sanscript";
import { env } from "./env";
import { normaliseLanguageCode, type SpokenLanguage } from "./languages";

export interface TranscribedSegment {
  start: number;
  end: number;
  text: string;
  confidence: number | null;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscribedSegment[];
  /** Normalised language code Whisper detected (or the one we forced). */
  language: string;
}

// Shape of Groq's verbose_json response (the SDK types it loosely).
interface VerboseWord {
  word: string;
  start: number;
  end: number;
}
interface VerboseSegment {
  start: number;
  end: number;
  text: string;
}
interface VerboseTranscription {
  text: string;
  language?: string;
  words?: VerboseWord[];
  segments?: VerboseSegment[];
}

let client: Groq | null = null;
export function groqClient(): Groq {
  if (!env.groqApiKey) {
    throw new Error("GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys and add it to .env");
  }
  client ??= new Groq({ apiKey: env.groqApiKey, maxRetries: 3 });
  return client;
}

const MAX_WORDS_PER_SEGMENT = 10;
const PAUSE_THRESHOLD_SECONDS = 0.5;

// Whisper follows the *script* of its prompt. A Roman-script Hindi example makes it write
// Hinglish as "mujhe yeh jaanna tha ki mere mobile number mein..." instead of Devanagari or an
// English translation. (Instruction-style prompts get echoed into the transcript, so avoid those.)
const HINGLISH_PROMPT =
  "Namaste. Yeh ek Hinglish transcript hai. Hindi ke shabd Roman script mein likhe hain aur English words English mein, jaise: mujhe yeh jaanna tha ki mere mobile number mein multiple 4 aur 7 kyun nahi hai.";

export interface WhisperMode {
  language?: string;
  prompt?: string;
  /** The script the output text will be in. `undefined` means "whatever Whisper detects". */
  script?: string;
}

/** Maps the user's spoken-language choice to Whisper parameters and the resulting script. */
export function whisperModeFor(spoken: SpokenLanguage, detected?: string | null): WhisperMode {
  switch (spoken) {
    case "hi-en":
      return { language: "en", prompt: HINGLISH_PROMPT, script: "hi-en" };
    case "hi":
      return { language: "hi", script: "hi" };
    case "en":
      return { language: "en", script: "en" };
    case "auto":
      // Once the first chunk has told us the language, pin it so later chunks stay consistent.
      return detected && detected !== "unknown" ? { language: detected, script: detected } : {};
  }
}

/** Whisper occasionally echoes the prompt at the start of the output. Returns how many words to drop. */
function promptEchoWordCount(text: string, prompt: string | undefined): number {
  if (!prompt) return 0;
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return norm(text).startsWith(norm(prompt)) ? prompt.trim().split(/\s+/).length : 0;
}

/** Groups word timestamps into caption-sized segments: break on a pause or every N words. */
function segmentsFromWords(words: VerboseWord[]): TranscribedSegment[] {
  const segments: TranscribedSegment[] = [];
  let current: { words: string[]; start: number; end: number } | null = null;

  words.forEach((w, i) => {
    if (!current) current = { words: [], start: w.start, end: w.end };
    current.words.push(w.word.trim());
    current.end = w.end;

    const next = words[i + 1];
    const pauseAhead = next ? next.start - w.end > PAUSE_THRESHOLD_SECONDS : false;
    if (current.words.length >= MAX_WORDS_PER_SEGMENT || pauseAhead || !next) {
      segments.push({ start: current.start, end: current.end, text: current.words.join(" ").trim(), confidence: 1 });
      current = null;
    }
  });
  return segments;
}

/** Transcribes one audio file; timestamps are shifted by `offset` seconds. */
export async function transcribeFile(audioPath: string, mode: WhisperMode, offset = 0): Promise<TranscriptionResult> {
  const params: Parameters<Groq["audio"]["transcriptions"]["create"]>[0] = {
    file: fs.createReadStream(audioPath),
    model: "whisper-large-v3",
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
    temperature: 0,
  };
  if (mode.language) params.language = mode.language;
  if (mode.prompt) params.prompt = mode.prompt;

  const response = (await groqClient().audio.transcriptions.create(params)) as unknown as VerboseTranscription;
  response.text = response.text ?? "";
  const echoed = promptEchoWordCount(response.text, params.prompt);
  if (echoed) {
    response.text = response.text.trim().split(/\s+/).slice(echoed).join(" ");
    response.words = response.words?.slice(echoed);
  }

  let segments: TranscribedSegment[] = [];
  if (response.words?.length) {
    segments = segmentsFromWords(response.words);
  } else if (response.segments?.length) {
    segments = response.segments.map((s) => ({ start: s.start, end: s.end, text: s.text.trim(), confidence: 1 }));
  }
  if (offset) segments = segments.map((s) => ({ ...s, start: s.start + offset, end: s.end + offset }));

  return {
    text: response.text.trim(),
    segments,
    language: mode.language ?? normaliseLanguageCode(response.language),
  };
}

// --- Script helpers ---------------------------------------------------------

const DIACRITIC_MAP: Record<string, string> = {
  ā: "a", Ā: "A", ī: "i", Ī: "I", ū: "u", Ū: "U", ē: "e", Ē: "E", ō: "o", Ō: "O",
  ṛ: "ri", Ṛ: "Ri", ṝ: "ri", Ṝ: "Ri", ḷ: "li", Ḷ: "Li", ḹ: "li", Ḹ: "Li",
  ṅ: "n", Ṅ: "N", ñ: "n", Ñ: "N", ṭ: "t", Ṭ: "T", ḍ: "d", Ḍ: "D", ṇ: "n", Ṇ: "N",
  ś: "sh", Ś: "Sh", ṣ: "sh", Ṣ: "Sh", ḥ: "h", Ḥ: "H", ṁ: "m", Ṁ: "M", ṃ: "m", Ṃ: "M",
  "̃": "", // standalone nasalisation mark
};
const DIACRITIC_RE = new RegExp(`[${Object.keys(DIACRITIC_MAP).join("")}]`, "g");
export const DEVANAGARI_RE = /[ऀ-ॿ]/;

/** Safety net for Roman output: if any Devanagari slipped through, romanise it (ISO) and strip diacritics. */
export function toPlainHinglish(text: string): string {
  let out = text;
  if (DEVANAGARI_RE.test(out)) out = Sanscript.t(out, "devanagari", "iso");
  return out.normalize("NFC").replace(DIACRITIC_RE, (ch) => DIACRITIC_MAP[ch] ?? ch);
}

/** Applies script-specific clean-up to a whole result. */
export function postProcess(result: TranscriptionResult, script: string): TranscriptionResult {
  if (script !== "hi-en") return result;
  return {
    ...result,
    text: toPlainHinglish(result.text),
    segments: result.segments.map((s) => ({ ...s, text: toPlainHinglish(s.text) })),
  };
}
