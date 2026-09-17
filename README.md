# Auto Transcribe Generator

Upload an audio or video file and get an editable transcript with downloadable captions (SRT, VTT, TXT, JSON). Hindi audio can be delivered as Hindi (Devanagari), Hinglish (Roman) or both — bilingual captions included.

Built with Next.js (App Router, TypeScript, Tailwind) and Groq's hosted `whisper-large-v3`. No database: each transcription is a JSON document — a file under `data/` locally, a private blob in Vercel Blob when deployed.

## Features

- Upload any audio or video file up to 500 MB — MP3, WAV, M4A, OGG/OPUS (WhatsApp voice notes), AAC, FLAC, WMA, AMR, MP4, MOV, MKV, WEBM, AVI and more (streamed to disk, no memory buffering)
- Audio is extracted and normalised with a bundled ffmpeg, then split into chunks so long files work
- Spoken language: Auto-detect, Hinglish, Hindi or English. Transcription with word-level timestamps, grouped into caption-sized segments
- AI spelling pass right after transcription: misheard English words, broken word boundaries ("karto" → "kar do") and inconsistent Hindi spellings are fixed without paraphrasing; the raw Whisper text is kept per segment
- Output language chosen on the result page, only the options that make sense for the audio: Hindi speech → Hinglish (Roman), Hindi (Devanagari) or both; English speech → English
- The second script is generated from the primary transcript with a Groq chat model, segment-aligned 1:1, so bilingual captions (Devanagari + Roman in each cue) are exact
- Live progress with stage names while processing; retry for failed jobs
- Edit any segment inline — full text and caption files are rebuilt automatically
- Export SRT / VTT / TXT / JSON per script or bilingual, with an optional "words per line" re-split for reels/shorts or YouTube

## Setup

```bash
npm install
cp .env.example .env        # then put your GROQ_API_KEY in .env
npm run dev                 # http://localhost:3000
```

Nothing else needs to be installed: ffmpeg is bundled via `ffmpeg-static`; uploads go to `uploads/` and documents to `data/`.

## Scripts

| Script               | What it does                              |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Development server                        |
| `npm run build`      | Production build (`npm start` to serve)   |
| `npm run lint`       | ESLint                                    |
| `npm run typecheck`  | TypeScript                                |

## Environment

| Variable             | Default          | Notes                                                   |
| -------------------- | ---------------- | ------------------------------------------------------- |
| `GROQ_API_KEY`       | —                | Required. Free key at https://console.groq.com/keys     |
| `UPLOAD_DIR`         | `./uploads`      | Local mode: where uploaded media is stored              |
| `DATA_DIR`           | `./data`         | Local mode: where transcription documents are stored    |
| `STORAGE_MODE`       | auto             | `local` or `blob`; defaults to `blob` on Vercel, `local` elsewhere |
| `BLOB_READ_WRITE_TOKEN` | —             | Vercel Blob token (added automatically when a store is connected) |
| `MAX_UPLOAD_SIZE_MB` | `500`            |                                                         |
| `CHUNK_SECONDS`      | `600`            | Audio longer than this is transcribed in chunks         |
| `GROQ_TEXT_MODEL`    | `openai/gpt-oss-120b` | Chat model used for the spelling pass and Hindi ↔ Hinglish conversion |
| `SPELLING_PASS`      | `on`             | AI spelling pass after every transcription (`off` to disable) |
| `VOCABULARY`         | numerology, … | Comma-separated words that come up often; fed to Whisper and the spelling pass |

## API

All routes return JSON unless noted.

| Method | Route                                                | Purpose                                              |
| ------ | ---------------------------------------------------- | ---------------------------------------------------- |
| POST   | `/api/files/upload`                                  | Local mode: multipart `file` + `language` (`auto`, `hi-en`, `hi`, `en`) |
| POST   | `/api/files/blob`                                    | Blob mode: token exchange for browser → Vercel Blob uploads |
| POST   | `/api/files/register`                                | Blob mode: `{ url, fileName, contentType, language }` after the upload |
| GET    | `/api/transcriptions`                                | List (with per-script status)                        |
| GET    | `/api/transcriptions/:id`                            | Detail: every script with its segments and captions, plus `outputOptions` |
| DELETE | `/api/transcriptions/:id`                            | Deletes transcription, media row and file on disk    |
| GET    | `/api/transcriptions/:id/status`                     | `{ status, progress, stage, errorMessage, variants }` |
| POST   | `/api/transcriptions/:id/variants`                   | `{ script }` — generate another output script (e.g. `hi`, `hi-en`) |
| GET    | `/api/transcriptions/:id/segments?script=hi-en`      | Segments of one script (default: primary)            |
| PATCH  | `/api/transcriptions/:id/segments/:segmentId`        | `{ text?, startTime?, endTime? }` — rebuilds that script's captions |
| GET    | `/api/transcriptions/:id/export?format=srt&script=hi-en&download=true&wordsPerLine=4` | Caption file; `script=both` gives bilingual cues |
| POST   | `/api/transcriptions/:id/regenerate`                 | Rebuild caption files of every script                |
| POST   | `/api/transcriptions/:id/retry`                      | Re-run a failed job; a completed one needs `{ "force": true }` (edits and generated scripts are discarded) |

## Project layout

```
src/lib/store.ts            document model + storage backends (local files / Vercel Blob)
src/lib/storage.ts          where media lives (local disk / Vercel Blob) and how the pipeline reads it
src/app                     pages: /upload, /transcriptions, /transcriptions/[id]
src/app/api                 route handlers (see table above)
src/lib/pipeline.ts         background jobs: media -> audio -> Whisper -> primary script; primary -> converted script
src/lib/jobs.ts             schedules jobs with next/server after() (keeps Vercel functions alive up to maxDuration)
src/lib/audio.ts            ffmpeg helpers (duration, extraction, chunking)
src/lib/transcribe.ts       Groq Whisper call, language modes, Hinglish clean-up
src/lib/correct.ts          AI spelling pass (line-aligned, guarded against rewrites)
src/lib/convert.ts          Devanagari <-> Roman Hinglish conversion via a Groq chat model
src/lib/languages.ts        spoken-language options and the rules for which output scripts to offer
src/lib/captions.ts         SRT/VTT/TXT/JSON generators, merge/split/bilingual helpers
src/lib/formats.ts          accepted file formats
src/instrumentation.ts      marks jobs interrupted by a restart as failed (local mode)
uploads/, data/             local media + documents (gitignored)
```

## Deploying on Vercel

The project is set up for Vercel: media and documents live in a **private Vercel Blob store**, the browser uploads straight to Blob (so the 4.5 MB function body limit does not apply), and processing runs in `after()` with `maxDuration = 300` on the upload/retry/variants routes. Jobs that go silent for 20 minutes are shown as failed with a retry.

Environment variables on Vercel: `BLOB_READ_WRITE_TOKEN` (from the connected store), `GROQ_API_KEY`, `GROQ_TEXT_MODEL`, `MAX_UPLOAD_SIZE_MB`, `CHUNK_SECONDS`.

Limits to keep in mind: one transcription job must finish within the function's max duration (300 s covers roughly an hour of audio), and `/tmp` on a function is 500 MB, so very large videos may need a smaller `MAX_UPLOAD_SIZE_MB`.
