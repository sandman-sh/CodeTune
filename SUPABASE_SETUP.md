# Supabase Setup

This project already uses PostgreSQL through Drizzle, so Supabase can be used without changing the app architecture.

## What to use

- Use your Supabase Postgres connection string as `DATABASE_URL`.
- For runtime and Vercel, prefer the pooled connection string.
- Keep `FIRECRAWL_API_KEY` and `ELEVENLABS_API_KEY` alongside it in `.env.local` locally and in your Vercel environment settings in production.

## Local setup

1. Open your Supabase project and copy the pooled Postgres connection string.
2. Put it in [`E:\project\CodeTune\.env.local`](E:/project/CodeTune/.env.local) as:

```env
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@[HOST]:6543/postgres?sslmode=require
```

3. Push the schema:

```powershell
corepack pnpm run db:push
```

4. Start the app:

```powershell
corepack pnpm --filter @codetune/api run build
corepack pnpm --filter @codetune/web run dev
```

## Vercel setup

Set these environment variables in Vercel:

- `DATABASE_URL`
- `FIRECRAWL_API_KEY`
- `ELEVENLABS_API_KEY`

The frontend build is already configured in [`E:\project\CodeTune\vercel.json`](E:/project/CodeTune/vercel.json), and the server entrypoint is [`E:\project\CodeTune\api\index.ts`](E:/project/CodeTune/api/index.ts).

## Current schema

The main table lives in [`E:\project\CodeTune\packages\database\src\schema\soundtracks.ts`](E:/project/CodeTune/packages/database/src/schema/soundtracks.ts).

That table stores:

- repo metadata
- lyrics
- generated audio URL
- music analysis metadata
- timestamps
