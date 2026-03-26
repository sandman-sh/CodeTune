# CodeTune

CodeTune is a voice-powered AI repo assistant.

Paste a GitHub repo URL and CodeTune helps users understand the project, inspect its structure, debug issues, and hear repo-aware answers in voice. Using the same repository context, it can also generate music that reflects the codebase's structure, purpose, and engineering style.

## What It Does

- Accepts a public GitHub repository URL as input
- Analyzes repository context using Firecrawl, repository structure, and sampled source files
- Starts in `Talk to Repo`, where users can:
  - understand what a repository does
  - inspect architecture, file structure, and important files
  - ask how to run or debug the project
  - explore issue-related context for debugging
  - receive answers in both text and voice
- Supports a direct handoff into `Code to Music` using the same repository context
- Generates instrumental or lyrical tracks that are personalized to the repository
- Stores soundtrack metadata in Supabase Postgres
- Provides playback, sharing, and download support for generated results

## Stack

- Frontend: React, Vite, TypeScript, Framer Motion
- Backend: Express, TypeScript, esbuild
- Database: Postgres via Supabase
- Validation: Zod
- ORM: Drizzle
- Repo analysis: Firecrawl + repository structure + sampled source files
- AI routing for analysis and chat: OpenRouter -> DeepSeek -> Groq -> Gemini
- Voice and music: ElevenLabs
- Voice transcription: Gemini

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

- One repo URL powers two connected experiences:
  - `Talk to Repo`
  - `Code to Music`
- Talk mode with:
  - repo analysis
  - AI chat over repo context
  - voice playback
  - voice input transcription
  - file-aware answers
  - issue-aware answers and debugging help
- Music mode with:
  - instrumental and lyrical generation
  - repo-specific lyrics
  - code-to-music mapping
  - soundtrack card export and sharing
- Smooth handoff from Talk mode into Music mode with the same repo prefilled
- Supabase-backed soundtrack caching

## Why It Matters

CodeTune is designed to make repository onboarding and exploration faster.

It helps users:
- understand an unfamiliar codebase faster
- ask practical questions about setup, structure, and debugging
- inspect issue context without manually digging through the repo
- generate a soundtrack from the same repository context when a more expressive output is useful

## Requirements

- Node.js 20+
- `pnpm`
- Supabase Postgres database
- Firecrawl API key
- ElevenLabs API key
- Gemini API key
- At least one chat/analysis provider key:
  - OpenRouter
  - DeepSeek
  - Groq
  - or Gemini

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
OPENROUTER_API_KEY=
DEEPSEEK_API_KEY=
GROQ_API_KEY=
PORT=8080
BASE_PATH=/
VITE_API_ORIGIN=http://127.0.0.1:8080
```

Notes:

- Use the Supabase pooled connection string for `DATABASE_URL`
- `GEMINI_API_KEY` powers transcription and can also act as a fallback analysis/chat provider
- Talk mode tries providers in this order:
  - `OPENROUTER_API_KEY`
  - `DEEPSEEK_API_KEY`
  - `GROQ_API_KEY`
  - `GEMINI_API_KEY`
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

## Product Flow

1. Paste a GitHub repo URL
2. CodeTune analyzes the repository and starts in `Talk to Repo`
3. Ask questions about:
   - what the repo does
   - architecture
   - setup and run commands
   - file structure
   - issue counts, issue lists, and issue-specific debugging
4. Hear the repo reply in voice as well as text
5. Click `Turn This Repo Into Music`
6. Generate instrumental or lyrical music from the same repository context
7. Listen, view lyrics, and share the soundtrack

## Talk to Repo

Talk mode is the main entry point.

It is built for:
- understanding unfamiliar repos quickly
- explaining structure and important files
- helping users run or debug a project
- pulling issue context into the conversation when needed
- acting like the repo itself has become a voice-powered guide

## Code to Music

Music mode is the payoff layer.

It uses repo context to:
- map engineering style into musical traits
- build personalized lyrical prompts
- generate instrumental or lyrical tracks
- make the codebase feel memorable, not just understandable

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
- `OPENROUTER_API_KEY`
- `DEEPSEEK_API_KEY`
- `GROQ_API_KEY`

## Current ElevenLabs Notes

CodeTune now uses the proper Eleven Music API path for sung lyrical generation.

That means:

- Instrumental mode needs an API key with `sound_generation`
- Lyrical singing needs a key/workspace with Eleven Music access

If those permissions are missing, the app will still run, but audio generation will fail with a clear backend message instead of returning fake lyrical output.

## License

MIT
