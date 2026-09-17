// Spelling pass: a Groq chat model reads the whole transcript and fixes spelling, misheard
// English words and broken word boundaries — without paraphrasing. Lines stay 1:1 with segments.

import { env } from "./env";
import { DEVANAGARI_RE, groqClient } from "./transcribe";

const BATCH_SIZE = 80;

const SCRIPT_RULES: Record<string, string> = {
  "hi-en": `The text is Hinglish written in Roman script.
- Fix misspelt English words, including English words that were transcribed phonetically ("nimrolaji" -> "numerology", "sophtvair" -> "software", "gubharak" is Hindi -> "mubarak").
- Fix broken or fused word boundaries ("karto" -> "kar do", "dalto" -> "daal do", "hana" -> "hai na", "aara" -> "aa raha", "aari" -> "aa rahi", "aapko" stays).
- Use one consistent, common spelling for Hindi words throughout (nahi, kya, hai, hain, mein, wo, yeh, aur, kar, raha, rahi).
- Doubled letters carry meaning in Hinglish: "jaanna" (to know) is NOT "jaana" (to go), "kaam" is not "kam", "baat" is not "bat". Never add or remove a doubled letter unless the word is clearly the same word.
- Keep the Hinglish exactly as spoken: do NOT translate to English or to Devanagari, do not make it formal.`,
  hi: `The text is Hindi in Devanagari, with English words allowed in Latin script.
- Fix Devanagari spelling errors and wrong matras; fix misheard words when the correct word is obvious from context.
- English words that were written phonetically in Devanagari may be rewritten as the English word in Latin script (पोर्टफोलियो -> portfolio) only when it is clearly an English term.
- Do not translate, do not change the register.`,
  en: `The text is English.
- Fix spelling, misheard words that are obvious from context, capitalisation of names and sentence starts, and basic punctuation.
- Do not paraphrase or "improve" wording.`,
};

function systemPrompt(script: string, lineCount: number): string {
  const rules = SCRIPT_RULES[script] ?? SCRIPT_RULES.en;
  const vocab = env.vocabulary.length ? `\nWords that often appear in these recordings (spell them exactly like this): ${env.vocabulary.join(", ")}.` : "";
  return `You are a careful copy editor for automatic speech-recognition transcripts. You receive the transcript as numbered lines; consecutive lines are fragments of ONE continuous speech, so read them together for context.

${rules}${vocab}

STRICT RULES
- A fix must keep the SAME PRONUNCIATION: only respell the sounds that were heard ("karto" -> "kar do", "gubharak ho" -> "mubarak ho"). Never swap a word for a different-sounding word, even if it would make more sense.
- Never change names of people, brands or places ("Batra Sir", "Jugnu", "IAMSA"): a word next to Sir/ji/sahab/madam, or a capitalised word in Roman script, is a name — copy it exactly.
- Where the audio was unclear the transcript may contain odd or nonsense words: leave them exactly as they are rather than guessing. When in doubt, do not change.
- Never add, drop, reorder or paraphrase words; never add words like है/हैं/ना/hai/na; never add punctuation at the end of a line; never merge, split, drop or reorder lines.
- Keep numbers and punctuation as they are.
- Return ONLY a JSON object of the form {"lines": ["...", "..."]} with exactly ${lineCount} lines in the same order, without the leading numbers.`;
}

async function correctBatch(lines: string[], script: string): Promise<string[]> {
  const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
  const response = await groqClient().chat.completions.create({
    model: env.groqTextModel,
    temperature: 0,
    max_tokens: 8000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt(script, lines.length) },
      { role: "user", content: numbered },
    ],
  });
  const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as { lines?: unknown };
  const out = Array.isArray(parsed.lines) ? parsed.lines : [];
  if (out.length !== lines.length) throw new Error(`Spelling pass returned ${out.length} lines, expected ${lines.length}`);
  return out.map((l, i) => (typeof l === "string" && l.trim() ? l.replace(/^\s*\d+[.)]\s*/, "").trim() : lines[i]));
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Guards against the model rewriting a line: keep the original when the word count moves too much. */
function accept(original: string, corrected: string, script: string): string {
  const a = words(original);
  const b = words(corrected);
  if (a === 0) return original;
  if (Math.abs(a - b) > Math.max(2, Math.ceil(a * 0.35))) return original;
  // A spelling pass touches a few words, not most of the line.
  const before = new Set(original.toLowerCase().split(/\s+/));
  const kept = corrected.toLowerCase().split(/\s+/).filter((w) => before.has(w)).length;
  if (b > 3 && kept < b / 2) return original;
  if (script === "hi-en" && DEVANAGARI_RE.test(corrected)) return original;
  if (script === "hi" && DEVANAGARI_RE.test(original) && !DEVANAGARI_RE.test(corrected)) return original;
  return corrected;
}

/**
 * Returns corrected lines aligned 1:1 with the input. Any batch that fails twice is returned
 * unchanged, so a Groq hiccup never blocks the transcription.
 */
export async function correctLines(lines: string[], script: string): Promise<string[]> {
  if (!env.spellingPass || lines.length === 0 || !SCRIPT_RULES[script]) return lines;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    const batch = lines.slice(i, i + BATCH_SIZE);
    let corrected: string[] | null = null;
    for (let attempt = 0; attempt < 2 && !corrected; attempt++) {
      try {
        corrected = await correctBatch(batch, script);
      } catch (error) {
        console.warn(`[correct] batch ${i / BATCH_SIZE + 1} attempt ${attempt + 1} failed:`, error instanceof Error ? error.message : error);
      }
    }
    out.push(...(corrected ? batch.map((line, j) => accept(line, corrected![j], script)) : batch));
  }
  return out;
}
