# CodeTune

CodeTune turns a GitHub repository into music.

Paste a repo URL, analyze the codebase, generate lyrics from the repository context, map engineering patterns into musical parameters, and return a soundtrack that feels tied to the project itself.

## What It Does

- Accepts any public GitHub repository URL
- Scrapes repo context with Firecrawl
- Reads repository metadata and code structure
- Extracts code signals such as:
  - primary language
  - function count
  - loop count
  - nesting depth
  - comment density
  - overall code personality
- Converts those signals into:
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
- Repo analysis: Firecrawl + repository metadata analysis
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

- Repo-to-music generation
- Instrumental and lyrical modes
- Quick and full-length generation
- Code DNA breakdown in the UI
- Soundtrack card export and sharing
- Supabase-backed soundtrack caching

## Requirements

- Node.js 20+
- `pnpm`
- Supabase Postgres database
- Firecrawl API key
- ElevenLabs API key

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
PORT=8080
BASE_PATH=/
VITE_API_ORIGIN=http://127.0.0.1:8080
```

Notes:

- Use the Supabase pooled connection string for `DATABASE_URL`
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
- `PORT`
- `BASE_PATH`
- `VITE_API_ORIGIN`

## Current ElevenLabs Notes

CodeTune now uses the proper Eleven Music API path for sung lyrical generation.

That means:

- Instrumental mode needs an API key with `sound_generation`
- Lyrical singing needs a key/workspace with Eleven Music access

If those permissions are missing, the app will still run, but audio generation will fail with a clear backend message instead of returning fake lyrical output.

## Product Flow

1. User submits a GitHub repo URL
2. Backend normalizes the URL and checks cache
3. Firecrawl and repository metadata are used to analyze the repository
4. Code metrics are mapped into musical traits
5. Lyrics are generated from repo purpose and code structure
6. Audio is generated through ElevenLabs
7. Metadata is stored in Supabase
8. Frontend renders player, lyrics, Code DNA, and soundtrack card

## License

MIT
