# Auto Transcribe Generator

Upload an audio or video file and get an editable transcript with downloadable captions (SRT, VTT, TXT, JSON). Hindi audio can be delivered as Hindi (Devanagari), Hinglish (Roman) or both — bilingual captions included.

Built with Next.js (App Router, TypeScript, Tailwind), Prisma + SQLite, and Groq's hosted `whisper-large-v3`.

## Features

- Upload any audio or video file up to 500 MB — MP3, WAV, M4A, OGG/OPUS (WhatsApp voice notes), AAC, FLAC, WMA, AMR, MP4, MOV, MKV, WEBM, AVI and more (streamed to disk, no memory buffering)
- Audio is extracted and normalised with a bundled ffmpeg, then split into chunks so long files work
- Spoken language: Auto-detect, Hinglish, Hindi or English. Transcription with word-level timestamps, grouped into caption-sized segments
- Output language chosen on the result page, only the options that make sense for the audio: Hindi speech → Hinglish (Roman), Hindi (Devanagari) or both; English speech → English
- The second script is generated from the primary transcript with a Groq chat model, segment-aligned 1:1, so bilingual captions (Devanagari + Roman in each cue) are exact
- Live progress with stage names while processing; retry for failed jobs
- Edit any segment inline — full text and caption files are rebuilt automatically
- Export SRT / VTT / TXT / JSON per script or bilingual, with an optional "words per line" re-split for reels/shorts or YouTube

## Setup

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then put your GROQ_API_KEY in .env
npm run db:migrate          # creates dev.db (local SQLite)
npm run dev                 # http://localhost:3000
```

Nothing else needs to be installed: ffmpeg is bundled via `ffmpeg-static` and SQLite is embedded.

## Scripts

| Script               | What it does                              |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Development server                        |
| `npm run build`      | Production build (`npm start` to serve)   |
| `npm run lint`       | ESLint                                    |
| `npm run typecheck`  | TypeScript                                |
| `npm run db:migrate` | Create/apply migrations in development    |
| `npm run db:deploy`  | Apply migrations in production            |
| `npm run db:studio`  | Prisma Studio (browse the database)       |

## Environment

| Variable             | Default          | Notes                                                   |
| -------------------- | ---------------- | ------------------------------------------------------- |
| `DATABASE_URL`       | `file:./dev.db`  | SQLite now; Postgres connection string for Supabase     |
| `GROQ_API_KEY`       | —                | Required. Free key at https://console.groq.com/keys     |
| `UPLOAD_DIR`         | `./uploads`      | Where uploaded media is stored                          |
| `MAX_UPLOAD_SIZE_MB` | `500`            |                                                         |
| `CHUNK_SECONDS`      | `600`            | Audio longer than this is transcribed in chunks         |
| `GROQ_TEXT_MODEL`    | `openai/gpt-oss-120b` | Chat model used for Hindi ↔ Hinglish script conversion |

## API

All routes return JSON unless noted.

| Method | Route                                                | Purpose                                              |
| ------ | ---------------------------------------------------- | ---------------------------------------------------- |
| POST   | `/api/files/upload`                                  | multipart `file` + `language` (`auto`, `hi-en`, `hi`, `en`) |
| GET    | `/api/transcriptions`                                | List (with per-script status)                        |
| GET    | `/api/transcriptions/:id`                            | Detail: every script with its segments and captions, plus `outputOptions` |
| DELETE | `/api/transcriptions/:id`                            | Deletes transcription, media row and file on disk    |
| GET    | `/api/transcriptions/:id/status`                     | `{ status, progress, stage, errorMessage, variants }` |
| POST   | `/api/transcriptions/:id/variants`                   | `{ script }` — generate another output script (e.g. `hi`, `hi-en`) |
| GET    | `/api/transcriptions/:id/segments?script=hi-en`      | Segments of one script (default: primary)            |
| PATCH  | `/api/transcriptions/:id/segments/:segmentId`        | `{ text?, startTime?, endTime? }` — rebuilds that script's captions |
| GET    | `/api/transcriptions/:id/export?format=srt&script=hi-en&download=true&wordsPerLine=4` | Caption file; `script=both` gives bilingual cues |
| POST   | `/api/transcriptions/:id/regenerate`                 | Rebuild caption files of every script                |
| POST   | `/api/transcriptions/:id/retry`                      | Re-run a failed job (regenerates derived scripts too) |

## Project layout

```
prisma/schema.prisma        data model (MediaFile, Transcription, TranscriptVariant, Segment, Caption)
src/app                     pages: /upload, /transcriptions, /transcriptions/[id]
src/app/api                 route handlers (see table above)
src/lib/pipeline.ts         background jobs: media -> audio -> Whisper -> primary script; primary -> converted script
src/lib/audio.ts            ffmpeg helpers (duration, extraction, chunking)
src/lib/transcribe.ts       Groq Whisper call, language modes, Hinglish clean-up
src/lib/convert.ts          Devanagari <-> Roman Hinglish conversion via a Groq chat model
src/lib/languages.ts        spoken-language options and the rules for which output scripts to offer
src/lib/captions.ts         SRT/VTT/TXT/JSON generators, merge/split/bilingual helpers
src/lib/formats.ts          accepted file formats
src/instrumentation.ts      marks jobs interrupted by a restart as failed
uploads/                    uploaded media (gitignored)
```

Processing runs inside the Next.js server process (started from the upload route), so the app needs a long-running Node server (`npm run dev` / `npm start`), not a serverless deployment.

## Switching to Supabase (Postgres)

1. `npm install @prisma/adapter-pg` and remove `@prisma/adapter-better-sqlite3`.
2. In `prisma/schema.prisma` set `provider = "postgresql"`.
3. In `src/lib/db.ts` replace the adapter:
   ```ts
   import { PrismaPg } from "@prisma/adapter-pg";
   const adapter = new PrismaPg({ connectionString: env.databaseUrl });
   ```
4. Set `DATABASE_URL` to the Supabase connection string (use the direct/session-pooler URL for migrations).
5. Delete `prisma/migrations` (they were generated for SQLite) and run `npm run db:migrate` to create fresh Postgres migrations.

Uploaded media stays on local disk; move it to Supabase Storage separately if needed.
