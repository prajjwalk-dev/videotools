// Script conversion between Devanagari Hindi, Roman Hinglish and Urdu using a Groq chat model.
// Works line-by-line so converted segments stay aligned 1:1 with the primary transcript.

import { env } from "./env";
import { scriptLabel } from "./languages";
import { DEVANAGARI_RE, groqClient, toPlainHinglish } from "./transcribe";

const BATCH_SIZE = 40;

const TARGET_RULES: Record<string, string> = {
  "hi-en":
    "Write the text in natural Roman-script Hinglish, the way Indians type on WhatsApp (e.g. 'मुझे ये जानना था' -> 'mujhe ye jaanna tha', 'क्यों' -> 'kyun', 'है' -> 'hai', 'नहीं' -> 'nahi'). No diacritics, no ISO transliteration. English words that were written phonetically in Devanagari must become the real English word with normal English spelling (सर -> Sir, मोबाइल नंबर -> mobile number, प्रॉब्लम -> problem, पोर्टफोलियो -> portfolio, चेंज -> change, कलरफुल -> colourful, एक्सपीरियंस -> experience, पेज टू -> page 2). Keep words already in Latin script as they are.",
  hi: "Write the text in Hindi using Devanagari script. Keep genuinely English words (like 'mobile number', 'multiple', 'problem', 'date of birth', 'portfolio', 'section') in Latin script as they are, but EVERY Hindi word must be in Devanagari even when it sits next to an English word: 'change karto' -> 'change कर दो', 'add karo' -> 'add करो', 'colourful banao' -> 'colourful बनाओ', 'hain na' -> 'हैं ना', 'woh' -> 'वो'. Names of people stay in Latin script. Use Devanagari punctuation only where natural.",
  ur: "Write the text in Urdu using Perso-Arabic (Nastaliq) script. Keep English words in Latin script as they are.",
};

const CONTINUITY_RULE =
  "The numbered lines are consecutive fragments of ONE continuous speech, not separate sentences: do not capitalise the first word of a line unless it actually starts a new sentence (the previous line ended with . ? or !), and do not add a full stop at the end of a line that is not the end of a sentence.";

function rulesFor(from: string, to: string): string {
  const target = TARGET_RULES[to];
  if (!target) throw new Error(`Cannot convert to script "${to}"`);
  return `You convert transcript lines from ${scriptLabel(from)} to ${scriptLabel(to)}. This is a SCRIPT conversion of the same spoken words — never translate, paraphrase, add, drop or reorder words. Keep numbers and punctuation. ${target} ${CONTINUITY_RULE}`;
}

/** Asks the model to convert a batch of lines and returns them in the same order. */
async function convertLines(lines: string[], from: string, to: string): Promise<string[]> {
  const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
  const response = await groqClient().chat.completions.create({
    model: env.groqTextModel,
    temperature: 0.1,
    max_tokens: 8000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `${rulesFor(from, to)}\n\nYou receive numbered lines. Return ONLY a JSON object of the form {"lines": ["...", "..."]} with exactly ${lines.length} converted lines in the same order, WITHOUT the leading numbers. Never merge, drop or reorder lines.`,
      },
      { role: "user", content: numbered },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  const parsed = JSON.parse(raw) as { lines?: unknown };
  const out = Array.isArray(parsed.lines) ? parsed.lines : [];
  if (out.length !== lines.length) throw new Error(`Conversion returned ${out.length} lines, expected ${lines.length}`);
  return out.map((l, i) => {
    const text = typeof l === "string" ? l.replace(/^\s*\d+[.)]\s*/, "").trim() : "";
    return text || lines[i];
  });
}

/** A token that mixes Devanagari and Latin letters (e.g. "आसakte") means the model half-converted a word. */
function hasMixedScriptToken(line: string): boolean {
  return line.split(/\s+/).some((token) => DEVANAGARI_RE.test(token) && /[A-Za-z]/.test(token.replace(/[^\p{L}]/gu, "")));
}

/** Converts every line; retries a batch once, then throws. Output is script-checked per target. */
export async function convertScript(
  lines: string[],
  from: string,
  to: string,
  onProgress?: (done: number, total: number) => Promise<void> | void,
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    const batch = lines.slice(i, i + BATCH_SIZE);
    let converted: string[];
    try {
      converted = await convertLines(batch, from, to);
      if (to === "hi" && converted.some(hasMixedScriptToken)) throw new Error("mixed-script tokens in Devanagari output");
    } catch (first) {
      console.warn("[convert] batch failed, retrying:", first instanceof Error ? first.message : first);
      converted = await convertLines(batch, from, to);
    }
    if (to === "hi-en") converted = converted.map(toPlainHinglish);
    out.push(...converted);
    await onProgress?.(Math.min(i + BATCH_SIZE, lines.length), lines.length);
  }

  if (to === "hi" && !out.some((l) => DEVANAGARI_RE.test(l))) {
    throw new Error("Conversion did not produce Devanagari text");
  }
  // The continuity rule makes the model lower-case line starts; the very first word is always a sentence start.
  if (out.length && to === "hi-en") out[0] = out[0].charAt(0).toUpperCase() + out[0].slice(1);
  return out;
}
