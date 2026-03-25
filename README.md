# CodeTune

CodeTune turns a GitHub repository into an interactive AI experience.

Paste a repo URL, analyze the codebase, talk to the repo in natural language, or turn the repository into a soundtrack that feels tied to the project itself.

## What It Does

- Accepts any public GitHub repository URL
- Scrapes repo context with Firecrawl
- Reads repository metadata and code structure
- Lets users choose between two product modes:
  - `Talk to Repo`: analyze a codebase and chat with an AI guide that knows the repo
  - `Code to Music`: generate a soundtrack from the repo's structure, purpose, and engineering style
- Extracts code signals such as:
  - primary language
  - function count
  - loop count
  - nesting depth
  - comment density
  - overall code personality
- Converts those signals into:
  - repo summaries and code DNA
  - music parameters
  - repo-specific lyrics
  - instrumental or lyrical generation prompts
- Stores soundtrack metadata in Supabase Postgres
- Provides a soundtrack card for download/share

## Stack

- Frontend: React, Vite, TypeScript, Framer Motion
- Backend: Express, TypeScript, esbuild
- Database: Postgres via Supabase
- Validation: Zod
- ORM: Drizzle
- Repo analysis: Firecrawl + repository metadata + sampled source files
- AI chat + analysis: Gemini
- Audio provider: ElevenLabs

## Monorepo Structure

```text
apps/
  api/                 Express API
  web/                 React frontend

packages/
  api-client-react/    Generated frontend API client
  api-spec/            OpenAPI spec
  api-zod/             Shared request/response schemas
  database/            Drizzle schema + DB access
```

## Features

- Two product modes from one repo URL:
  - `Talk to Repo`
  - `Code to Music`
- Talk mode with:
  - repo analysis
  - AI chat over repo context
  - voice playback
  - voice input transcription
- Music mode with:
  - instrumental and lyrical generation
  - quick and full-length generation
  - code-to-music mapping
  - soundtrack card export and sharing
- Supabase-backed soundtrack caching

## Requirements

- Node.js 20+
- `pnpm`
- Supabase Postgres database
- Firecrawl API key
- ElevenLabs API key
- Gemini API key

## Environment Variables

Create a local env file from `.env.example`:

```bash
cp .env.example .env.local
```

Required values:

```env
DATABASE_URL=
FIRECRAWL_API_KEY=
ELEVENLABS_API_KEY=
GEMINI_API_KEY=
PORT=8080
BASE_PATH=/
VITE_API_ORIGIN=http://127.0.0.1:8080
```

Notes:

- Use the Supabase pooled connection string for `DATABASE_URL`
- `GEMINI_API_KEY` powers repo analysis, chat, and transcription in Talk mode
- `sound_generation` permission is required for instrumental audio
- Eleven Music access is required for true sung lyrical generation

## Install

```bash
corepack enable
pnpm install
```

## Database Setup

Push the schema after setting `DATABASE_URL`:

```bash
pnpm run db:push
```

There is also a Supabase setup guide in `SUPABASE_SETUP.md`.

## Run Locally

Start the frontend:

```bash
pnpm run dev:web
```

Start the API:

```bash
pnpm run dev:api
```

Default local URLs:

- Web: `http://127.0.0.1:22772/`
- API: `http://127.0.0.1:8080/`

## Product Modes

### Talk to Repo

Use Talk mode to:

- analyze a repository
- hear the repo introduce itself
- ask follow-up questions about setup, architecture, debugging, and code structure
- get summary, code DNA, and repo details directly inside the chat experience

### Code to Music

Use Music mode to:

- map repo structure and engineering traits into musical parameters
- generate instrumental or lyrical tracks
- display lyrics, player controls, code DNA, and soundtrack card output
- cache and revisit generated results

## Build

```bash
pnpm run typecheck
pnpm run build
```

Useful scripts:

```bash
pnpm run build:web
pnpm run build:api
pnpm run dev:web
pnpm run dev:api
pnpm run db:push
```

## Deployment

The repo includes `vercel.json` for frontend deployment.

For production, set these environment variables in Vercel:

- `DATABASE_URL`
- `FIRECRAWL_API_KEY`
- `ELEVENLABS_API_KEY`
- `GEMINI_API_KEY`

## Current ElevenLabs Notes

CodeTune now uses the proper Eleven Music API path for sung lyrical generation.

That means:

- Instrumental mode needs an API key with `sound_generation`
- Lyrical singing needs a key/workspace with Eleven Music access

If those permissions are missing, the app will still run, but audio generation will fail with a clear backend message instead of returning fake lyrical output.

## Product Flow

1. User submits a GitHub repo URL
2. Backend normalizes the URL and analyzes the repo with Firecrawl, metadata, and sampled files
3. User chooses a mode:
   - `Talk to Repo`
   - `Code to Music`
4. In Talk mode, Gemini generates repo-aware answers and voice features
5. In Music mode, code metrics are mapped into musical traits
6. Lyrics and/or prompts are generated from repo purpose and code structure
7. Audio is generated through ElevenLabs
8. Metadata is stored in Supabase
9. Frontend renders chat, player, lyrics, Code DNA, and soundtrack card output depending on mode

## License

MIT
