import { Router, type IRouter } from "express";
import { db } from "@codetune/database";
import { soundtracksTable } from "@codetune/database";
import { GenerateSoundtrackBody, CreateShareCardBody } from "@codetune/api-zod";
import FirecrawlApp from "@mendable/firecrawl-js";
import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

const router: IRouter = Router();

// Disk-based audio cache — persists across server restarts
const AUDIO_DIR = path.join(os.tmpdir(), "codetune-audio");
const INSTRUMENTAL_AUDIO_PIPELINE_VERSION = "instrumental-v1";
const LYRICAL_AUDIO_PIPELINE_VERSION = "lyrical-v3";

async function ensureAudioDir() {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
}

function getAudioPipelineVersion(mode: string): string {
  return mode === "lyrical" ? LYRICAL_AUDIO_PIPELINE_VERSION : INSTRUMENTAL_AUDIO_PIPELINE_VERSION;
}

function audioDiskKey(repoUrl: string, genre: string, mode: string, generationType: string): string {
  const hash = createHash("sha256")
    .update(`${repoUrl}|${genre}|${mode}|${generationType}|${getAudioPipelineVersion(mode)}`)
    .digest("hex")
    .slice(0, 16);
  return path.join(AUDIO_DIR, `${hash}.mp3`);
}

function buildAudioUrl(id: number, mode: string): string {
  return `/api/soundtracks/audio/${id}?v=${getAudioPipelineVersion(mode)}`;
}

function hasCurrentAudioPipeline(audioUrl: string | null, mode: string): boolean {
  return Boolean(audioUrl?.includes(`v=${getAudioPipelineVersion(mode)}`));
}

async function readAudioFromDisk(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(key);
  } catch {
    return null;
  }
}

async function writeAudioToDisk(key: string, buffer: Buffer): Promise<void> {
  await ensureAudioDir();
  await fs.writeFile(key, buffer);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "Audio generation failed.";
}

function buildAudioErrorMessage(error: unknown): string {
  const message = getErrorMessage(error);
  const lower = message.toLowerCase();

  if (lower.includes("credit") || lower.includes("quota") || lower.includes("insufficient")) {
    return "Not enough ElevenLabs credits for audio generation.";
  }

  if (
    lower.includes("elevenlabs_api_key is not set") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid api key") ||
    lower.includes("401")
  ) {
    return "ElevenLabs API key is missing or invalid.";
  }

  if (lower.includes("payment required") || lower.includes("402")) {
    return "Sung lyrical mode requires Eleven Music API access on a paid ElevenLabs plan.";
  }

  if (lower.includes("timeout")) {
    return "Audio generation timed out. Please try again.";
  }

  if (lower.startsWith("elevenlabs")) {
    return message;
  }

  return "Audio generation failed. Please try again.";
}

// In-memory audio cache keyed by soundtrack ID (fast serving)
const audioCache = new Map<number, Buffer>();

// ── Helpers ────────────────────────────────────────────────────────────────

function extractRepoName(repoUrl: string): string {
  try {
    const url = new URL(repoUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return parts[parts.length - 1] || "unknown-repo";
  } catch {
    return "unknown-repo";
  }
}

function normalizeGitHubUrl(input: string): string {
  let url = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  if (/^https?:\/\/(www\.)?github\.com\//i.test(url)) return url.replace(/^http:\/\//i, "https://");
  if (/^(www\.)?github\.com\//i.test(url)) return `https://${url.replace(/^www\./i, "")}`;
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`;
  return url;
}

function isValidGitHubUrl(url: string): boolean {
  return /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+/.test(url);
}

function extractTechWords(context: string): string[] {
  const keywords = [
    "react", "vue", "angular", "nextjs", "typescript", "javascript", "python",
    "rust", "golang", "kubernetes", "docker", "api", "graphql", "postgres",
    "redis", "aws", "firebase", "mongodb", "tensorflow", "pytorch", "llm",
    "ai", "ml", "cli", "framework", "library", "server", "database",
    "frontend", "backend", "fullstack", "microservice", "ci/cd", "performance",
  ];
  const lower = context.toLowerCase();
  return keywords.filter((k) => lower.includes(k)).slice(0, 6);
}

// ── GitHub API Stats ────────────────────────────────────────────────────────

interface GitHubStats {
  stars: number;
  forks: number;
  sizeKb: number;
  primaryLanguage: string;
  languages: Record<string, number>;
  openIssues: number;
  topics: string[];
  watchersCount: number;
  hasWiki: boolean;
  defaultBranch: string;
}

async function fetchGitHubStats(repoName: string): Promise<GitHubStats> {
  const defaults: GitHubStats = {
    stars: 0, forks: 0, sizeKb: 0, primaryLanguage: "Unknown",
    languages: {}, openIssues: 0, topics: [], watchersCount: 0,
    hasWiki: false, defaultBranch: "main",
  };
  try {
    const [repoRes, langRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${repoName}`, {
        headers: { "User-Agent": "CodeTune/1.0", "Accept": "application/vnd.github.v3+json" },
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`https://api.github.com/repos/${repoName}/languages`, {
        headers: { "User-Agent": "CodeTune/1.0", "Accept": "application/vnd.github.v3+json" },
        signal: AbortSignal.timeout(10000),
      }),
    ]);
    if (!repoRes.ok) return defaults;
    const repoData = (await repoRes.json()) as Partial<{
      stargazers_count: number;
      forks_count: number;
      size: number;
      language: string | null;
      open_issues_count: number;
      topics: string[];
      watchers_count: number;
      has_wiki: boolean;
      default_branch: string;
    }>;
    const langData = (langRes.ok ? await langRes.json() : {}) as Record<string, number>;
    return {
      stars: repoData.stargazers_count || 0,
      forks: repoData.forks_count || 0,
      sizeKb: repoData.size || 0,
      primaryLanguage: repoData.language || "Unknown",
      languages: langData,
      openIssues: repoData.open_issues_count || 0,
      topics: repoData.topics || [],
      watchersCount: repoData.watchers_count || 0,
      hasWiki: repoData.has_wiki || false,
      defaultBranch: repoData.default_branch || "main",
    };
  } catch {
    return defaults;
  }
}

// ── Code Pattern Analysis ───────────────────────────────────────────────────

interface CodeMetrics {
  functionCount: number;     // defs, function, fn, func, def, sub
  classCount: number;        // class, struct, interface, trait, enum
  loopCount: number;         // for, while, each, map, filter, reduce, forEach
  conditionalCount: number;  // if, switch, case, ternary, elif
  asyncCount: number;        // async, await, promise, callback, goroutine, thread
  errorHandlingCount: number;// try, catch, error, throw, panic, except, rescue
  commentDensity: number;    // // /* # comments
  importCount: number;       // import, require, include, use, using
  totalLines: number;
  codeLines: number;         // non-empty, non-comment lines
  nestingDepth: number;      // brace/indent depth estimate
}

function analyzeCodePatterns(rawText: string): CodeMetrics {
  const lines = rawText.split("\n");
  const text = rawText.toLowerCase();

  const count = (patterns: RegExp[]) =>
    patterns.reduce((acc, p) => acc + (rawText.match(new RegExp(p.source, "g")) || []).length, 0);

  const functionCount = count([
    /\bfunction\s+\w+/,
    /\bdef\s+\w+/,
    /\bfn\s+\w+/,
    /\bfunc\s+\w+/,
    /\(\s*\)\s*=>/,   // arrow functions
    /=>\s*\{/,
    /\bsub\s+\w+/,
    /\bmethod\s+\w+/,
  ]);

  const classCount = count([
    /\bclass\s+\w+/,
    /\bstruct\s+\w+/,
    /\binterface\s+\w+/,
    /\btrait\s+\w+/,
    /\benum\s+\w+/,
    /\btype\s+\w+\s+struct/,
  ]);

  const loopCount = count([
    /\bfor\s*[\(\s]/,
    /\bwhile\s*[\(\s]/,
    /\.forEach\s*\(/,
    /\.map\s*\(/,
    /\.filter\s*\(/,
    /\.reduce\s*\(/,
    /\.each\s*\{/,
    /\bloop\s*\{/,
  ]);

  const conditionalCount = count([
    /\bif\s*[\(\s]/,
    /\belse\s+if\s*[\(\s]/,
    /\belif\s*[\(\s]/,
    /\bswitch\s*[\(\s]/,
    /\bmatch\s+/,
    /\?\s*.*?:/,     // ternary
  ]);

  const asyncCount = count([
    /\basync\s+function/,
    /\basync\s+fn/,
    /\bawait\s+/,
    /\bPromise\./,
    /new\s+Promise/,
    /\bgo\s+\w+\(/,   // goroutines
    /\bchannel\b/,
    /\bThread\./,
    /\.then\s*\(/,
    /\.catch\s*\(/,
  ]);

  const errorHandlingCount = count([
    /\btry\s*\{/,
    /\bcatch\s*[\(\{]/,
    /\bthrow\s+/,
    /\bpanic\s*\(/,
    /\brescue\s+/,
    /\bexcept\s+/,
    /\berror\s*!=\s*nil/,   // Go error pattern
    /\bResult<|Err\(/,      // Rust error pattern
    /\.unwrap\(\)/,
  ]);

  const commentLines = lines.filter(l => {
    const t = l.trim();
    return t.startsWith("//") || t.startsWith("#") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("<!--");
  });

  const importCount = count([
    /\bimport\s+/,
    /\brequire\s*\(/,
    /\binclude\s+/,
    /\buse\s+\w+::/,
    /\busing\s+/,
    /^from\s+\S+\s+import/m,
  ]);

  const nonEmpty = lines.filter(l => l.trim().length > 0);
  const codeLines = nonEmpty.length - commentLines.length;

  // Estimate nesting depth by counting net braces/indents
  let maxDepth = 0;
  let depth = 0;
  for (const line of lines) {
    depth += (line.match(/\{/g) || []).length;
    depth -= (line.match(/\}/g) || []).length;
    if (depth > maxDepth) maxDepth = depth;
    if (depth < 0) depth = 0;
  }

  return {
    functionCount,
    classCount,
    loopCount,
    conditionalCount,
    asyncCount,
    errorHandlingCount,
    commentDensity: Math.round((commentLines.length / Math.max(nonEmpty.length, 1)) * 100),
    importCount,
    totalLines: lines.length,
    codeLines,
    nestingDepth: maxDepth,
  };
}

// ── Music Parameter Mapping ─────────────────────────────────────────────────

interface MusicParams {
  bpm: number;
  energy: string;
  mood: string;
  timbre: string;
  scale: string;
  rhythmStyle: string;
  harmonyStyle: string;
  density: string;
  signature: string;   // time signature hint
}

const LANGUAGE_TIMBRE: Record<string, string> = {
  TypeScript:  "clean synthesizers and electric piano",
  JavaScript:  "electric guitar riffs and warm synths",
  Python:      "acoustic piano, soft strings, and light percussion",
  Rust:        "heavy distorted guitar, tight precise drums, and industrial synths",
  Go:          "minimal clean bass, crisp hi-hats, and sparse piano",
  Java:        "orchestral brass, full string section, and grand piano",
  "C++":       "aggressive synth bass, raw analog pads, and metal-style guitar",
  C:           "raw analog synth, dry reverb, primitive drum machine",
  Ruby:        "warm jazz piano, brushed snare, and upright bass",
  Swift:       "modern pop synths, clean guitar, and polished production",
  Kotlin:      "modern electronic beats, bright synths, and punchy drums",
  PHP:         "mid-tempo groove, funk guitar, and Hammond organ",
  "C#":        "orchestral synths, epic choir pads, and stadium-style drums",
  Scala:       "fusion jazz, complex chords, and fretless bass",
  Haskell:     "ambient pads, recursive melodic motifs, and minimal percussion",
  Elixir:      "vibrant marimba, flowing arpeggios, and organic rhythm",
  Dart:        "bright xylophone, cheerful synths, and crisp snare",
  Shell:       "raw lo-fi beats, gritty bass, and minimal arrangement",
  Vim:         "sparse piano, long reverb tails, and meditative flow",
};

function codeMetricsToMusicParams(
  metrics: CodeMetrics,
  github: GitHubStats,
  genre: string
): MusicParams {
  const BASE_BPM: Record<string, number> = { lofi: 72, cinematic: 88, indie: 112, rap: 138 };
  const baseBpm = BASE_BPM[genre] || 100;

  // BPM driven by code complexity (functions + loops relative to LOC)
  const complexityRatio = (metrics.functionCount * 2 + metrics.loopCount * 3 + metrics.classCount) /
                           Math.max(metrics.codeLines / 10, 1);
  const bpmShift = Math.round(Math.min(Math.max(complexityRatio * 2 - 5, -15), 20));
  const bpm = Math.max(55, Math.min(175, baseBpm + bpmShift));

  // Energy: loop density + conditional branches
  const actionDensity = (metrics.loopCount + metrics.conditionalCount) / Math.max(metrics.codeLines / 20, 1);
  const energy = actionDensity > 8  ? "relentlessly high energy, driving and aggressive" :
                 actionDensity > 4  ? "high energy with dynamic peaks and drops" :
                 actionDensity > 1.5? "moderate energy, steady rhythmic pulse" :
                                      "relaxed and unhurried, flowing and meditative";

  // Mood: error handling = tense/serious; comments = warm/thoughtful; async = fluid/dynamic
  const seriousness = metrics.errorHandlingCount / Math.max(metrics.totalLines / 100, 1);
  const warmth = metrics.commentDensity;
  const fluidity = metrics.asyncCount / Math.max(metrics.functionCount, 1);
  const mood = seriousness > 3  ? "tense, serious, and purposeful" :
               warmth > 30      ? "warm, inviting, and reflective" :
               fluidity > 0.4   ? "fluid, flowing, and constantly evolving" :
                                  "focused, determined, and precise";

  // Timbre: primary language → instrument palette
  const timbre = LANGUAGE_TIMBRE[github.primaryLanguage] ||
    `${github.primaryLanguage.toLowerCase()} inspired instrumentation`;

  // Scale/key: star count → major (popular, bright) vs minor (niche, intimate)
  const scale = github.stars > 50000 ? "bright triumphant major key, anthemic and soaring" :
                github.stars > 10000 ? "confident major key, uplifting and assured" :
                github.stars > 1000  ? "balanced natural key, neither too bright nor dark" :
                github.stars > 100   ? "bittersweet minor-major mix, reflective but hopeful" :
                                       "deep introspective minor key, intimate and raw";

  // Rhythm style: nesting depth → polyrhythmic complexity
  const rhythmStyle = metrics.nestingDepth > 15 ? "polyrhythmic, interlocking complex patterns" :
                      metrics.nestingDepth > 8   ? "syncopated with off-beat accents and fills" :
                      metrics.nestingDepth > 4   ? "steady groove with occasional syncopation" :
                                                   "simple clean four-on-the-floor rhythm";

  // Harmony: import count → rich orchestration (many dependencies = many voices)
  const voiceCount = Math.min(metrics.importCount, 30);
  const harmonyStyle = voiceCount > 20 ? "dense, layered harmony with many interlocking voices" :
                       voiceCount > 10 ? "rich chord voicings with countermelody" :
                       voiceCount > 5  ? "clean harmonic structure with occasional color chords" :
                                         "sparse, open harmony with wide intervals";

  // Density: LOC → production fullness
  const locDensity = Math.min(metrics.codeLines / 500, 1);
  const density = locDensity > 0.8 ? "full, wall-of-sound production with dense arrangement" :
                  locDensity > 0.4 ? "medium production density, balanced mix" :
                                     "sparse, minimal production with breathing room";

  // Time signature: class/OOP → 4/4 structured; functional → 3/4 or 6/8 flowing
  const oop = metrics.classCount / Math.max(metrics.functionCount, 1);
  const signature = oop > 0.4 ? "in strict 4/4 time, structured and organized" :
                    metrics.asyncCount > metrics.functionCount * 0.5 ? "in flowing 6/8 time, triplet feel" :
                    metrics.loopCount > metrics.functionCount ? "with driving 4/4 groove" :
                    "in gentle 3/4 waltz time";

  return { bpm, energy, mood, timbre, scale, rhythmStyle, harmonyStyle, density, signature };
}

// ── Firecrawl — multi-page deep scrape ─────────────────────────────────────

async function scrapeRepoContext(repoUrl: string, repoName: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");

  const firecrawl = new FirecrawlApp({ apiKey });

  // Scrape 3 pages in parallel: main repo, code search for functions, code search for loops
  const [owner, repo] = repoName.split("/");
  const scrapeTargets = [
    repoUrl,
    `https://github.com/${owner}/${repo}/search?q=function+class+loop&type=code`,
  ];

  const results = await Promise.allSettled(
    scrapeTargets.map((url) =>
      (firecrawl as any).v1.scrapeUrl(url, {
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 15000,
      })
    )
  );

  const chunks: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value?.success) {
      const content: string = r.value.markdown || r.value.content || "";
      if (content.length > 100) chunks.push(content.slice(0, 3000));
    }
  }

  return chunks.join("\n\n---\n\n").slice(0, 8000);
}

// ── Lyrics generation ──────────────────────────────────────────────────────

const LYRIC_CONTEXT_NOISE_PATTERN = /skip to content|sign in|sign up|github|navigation menu|search code|open more actions menu|reload to refresh|dismiss alert|switched accounts/i;

function generatePersonalizedLyrics(
  repo: string,
  owner: string,
  genre: string,
  tech: string[],
  keyPhrases: string[],
  _metrics?: CodeMetrics,
  _github?: GitHubStats,
): string {
  const techLine = tech.length > 0 ? tech.slice(0, 3).join(", ") : "lines of code";
  const repoLabel = repo.replace(/[-_]+/g, " ").trim();
  const contextHint = keyPhrases.length > 0
    ? keyPhrases[0].replace(/[#*`]/g, "").trim().slice(0, 50)
    : `${repo} changing the game`;
  const detailHint = keyPhrases.length > 1
    ? keyPhrases[1].replace(/[#*`]/g, "").trim().slice(0, 50)
    : `${owner} shaped ${repoLabel} with ${techLine}`;

  const lyrics: Record<string, string> = {
    rap: `[Verse 1]
${repoLabel} on the screen and the signal feels strong
${contextHint}
${techLine} — that's the stack we running here
${techLine} in the mix, now the whole stack belongs
${detailHint}
Merge to main, no fear

[Chorus]
${repo}, ${repo}, this codebase got range
${owner} shipping features, nothing stays the same
From the terminal to prod, we never stop the grind
This repo hits different — one of a kind

[Verse 2]
Stack traces in the morning, deploys at midnight
Reviews coming back clean, everything looking tight
${techLine.split(",")[0] || "The stack"} running smooth, no incidents in sight
Open source and thriving, the community is right

[Chorus]
${repo}, ${repo}, this codebase got range
${owner} shipping features, nothing stays the same
From the terminal to prod, we never stop the grind
This repo hits different — one of a kind

[Outro]
That's ${repo} for life
Built different, built right`,

    lofi: `[Verse 1]
${repoLabel} glows beneath the screen light
${contextHint}
${owner}'s vision settles softly in the build tonight
${techLine} — the stars align

[Chorus]
Drift away with the code tonight
${repo} humming, everything's alright
Lo-fi beats and terminal dreams
Nothing is ever quite what it seems

[Verse 2]
${contextHint}
Pull request pending, soft keys play
${techLine.split(",")[0] || "Clean code"} flowing through the haze
One more function, then I'll close my eyes

[Chorus]
Drift away with the code tonight
${repo} humming, everything's alright
Lo-fi beats and terminal dreams
Nothing is ever quite what it seems

[Outro]
The repo breathes
Functions float in the breeze
${owner} and ${repo}
Still building, still at ease`,

    cinematic: `[Verse 1]
${repoLabel} steps out of the dark in full design
${contextHint}
${owner} pushed the vision past the warning signs
Built with ${techLine} — beyond the veil

[Chorus]
This is ${repo}, hear the servers roar
${owner}'s creation knocking at the door
Every function, every class, every line
This codebase was built to stand the test of time

[Verse 2]
${contextHint}
The pull requests merge, the battles are won
${techLine.split(",")[0] || "The foundation"} holding firm beneath the sun
From zero to production — the legend's begun

[Chorus]
This is ${repo}, hear the servers roar
${owner}'s creation knocking at the door
Every function, every class, every line
This codebase was built to stand the test of time

[Outro]
And when the dust settles
And the logs go quiet
${repo} still stands
Ready for what's next`,

    indie: `[Verse 1]
${repoLabel} landed softly in the middle of the day
${repo} — it felt like a brand new tune
${owner} left the feeling tucked inside the frame
${techLine.split(",")[0] || "silence"} carries it away

[Chorus]
But it's got a soundtrack now
${repo}, take a bow
Your functions and your loops
They're forming something real
This codebase plays aloud

[Verse 2]
${contextHint}
The issues tab is full of half-formed dreams
The commits tell a story, nothing's what it seems
Star count rising like a quiet melody
This codebase resonates with me

[Chorus]
But it's got a soundtrack now
${repo}, take a bow
Your functions and your loops
They're forming something real
This codebase plays aloud

[Outro]
And I'll keep coming back
To ${owner}/${repo}
Every commit a verse
In a song that never ends`,
  };

  return lyrics[genre] || lyrics.indie;
}

async function generateLyrics(
  repoName: string,
  genre: string,
  context: string,
  metrics?: CodeMetrics,
  github?: GitHubStats
): Promise<string> {
  const [owner, repo] = repoName.split("/");
  const tech = extractTechWords(context);
  const noisyLinePattern = LYRIC_CONTEXT_NOISE_PATTERN;
  const lines = context
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 20 && !noisyLinePattern.test(l))
    .slice(0, 8)
    .map((l) =>
      l
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[#*`]/g, "")
        .replace(/\s+/g, " ")
        .slice(0, 60),
    )
    .filter(Boolean);

  // Enrich tech with real GitHub language data
  if (github?.primaryLanguage && github.primaryLanguage !== "Unknown") {
    if (!tech.includes(github.primaryLanguage.toLowerCase())) {
      tech.unshift(github.primaryLanguage.toLowerCase());
    }
  }
  if (github?.topics) {
    for (const topic of github.topics.slice(0, 3)) {
      if (!tech.includes(topic)) tech.push(topic);
    }
  }

  // Add code-metric-aware phrases to keyPhrases
  if (metrics) {
    const metricPhrases: string[] = [];
    if (metrics.functionCount > 20) metricPhrases.push(`${metrics.functionCount} functions deep in the codebase`);
    if (metrics.loopCount > 10) metricPhrases.push(`${metrics.loopCount} loops spinning through the logic`);
    if (metrics.classCount > 5) metricPhrases.push(`${metrics.classCount} classes architected with precision`);
    if (metrics.asyncCount > 5) metricPhrases.push("async flows running parallel in the dark");
    if (metrics.errorHandlingCount > 8) metricPhrases.push("every error caught, every edge case handled");
    if (metrics.commentDensity > 25) metricPhrases.push("well-documented, comments guide the way");
    if (github && github.stars > 1000) metricPhrases.push(`${github.stars.toLocaleString()} stars lighting the night`);
    lines.push(...metricPhrases.slice(0, 3));
  }

  return generatePersonalizedLyrics(repo || repoName, owner || "dev", genre, tech, lines, metrics, github);
}

// ── ElevenLabs Sound Generation — real music from code metrics ──────────────

const GENRE_INSTRUMENTAL: Record<string, string> = {
  lofi:      "lofi hip hop instrumental music",
  cinematic: "epic cinematic orchestral score",
  indie:     "indie rock instrumental",
  rap:       "modern hip hop trap beat instrumental",
};

// ElevenLabs Sound Generation limit
const ELEVEN_MAX_CHARS = 450;

function buildMusicPrompt(
  genre: string,
  params: MusicParams,
  mode: "lyrical" | "instrumental"
): string {
  const base = GENRE_INSTRUMENTAL[genre] || GENRE_INSTRUMENTAL.indie;

  const prompt = mode === "lyrical"
    ? [
        base,
        params.timbre,
        `${params.bpm} BPM`,
        params.energy,
        params.mood,
        params.rhythmStyle,
        params.scale,
        "expressive lead vocals, memorable hooks, clearly sung topline",
        "full finished song, not instrumental only",
        "professional studio recording with vocals in the final mix",
      ].join(", ")
    : [
        base,
        params.timbre,
        `${params.bpm} BPM`,
        params.energy,
        params.mood,
        params.rhythmStyle,
        params.harmonyStyle,
        params.density,
        params.scale,
        params.signature,
        "high quality studio production, professional mix and master",
      ].join(", ");

  return prompt.slice(0, ELEVEN_MAX_CHARS);
}

// ── ElevenLabs TTS Vocals ───────────────────────────────────────────────────

// Premade ElevenLabs voice IDs (verified free-tier accessible)
const GENRE_VOICE_ID: Record<string, string> = {
  lofi:      "nPczCjzI2devNBz1zQrb",  // Brian — warm, conversational
  cinematic: "onwK4e9ZLuTAKqWW03F9",  // Daniel — deep, authoritative
  indie:     "IKne3meq5aSn9XLyUdCD",  // Charlie — natural, expressive
  rap:       "pqHfZKP75CvOlQylNhV4",  // Bill — deep, punchy
};

interface CompositionPlanSection {
  section_name: string;
  positive_local_styles: string[];
  negative_local_styles: string[];
  duration_ms: number;
  lines: string[];
}

interface CompositionPlan {
  positive_global_styles: string[];
  negative_global_styles: string[];
  sections: CompositionPlanSection[];
}

const LYRIC_NOISE_PATTERN = /open more actions menu|skip to content|sign in|sign up|navigation menu|search code/i;

function sanitizeLyricLine(line: string): string {
  return line
    .replace(LYRIC_NOISE_PATTERN, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLyricsIntoSections(lyrics: string): Array<{ sectionName: string; lines: string[] }> {
  const sections: Array<{ sectionName: string; lines: string[] }> = [];
  let currentSection = { sectionName: "Verse", lines: [] as string[] };

  for (const rawLine of lyrics.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const sectionMatch = line.match(/^\[(.+?)\]$/);
    if (sectionMatch) {
      if (currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { sectionName: sectionMatch[1], lines: [] };
      continue;
    }

    const cleaned = sanitizeLyricLine(line);
    if (cleaned) {
      currentSection.lines.push(cleaned.slice(0, 120));
    }
  }

  if (currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  return sections.length > 0 ? sections.slice(0, 4) : [{ sectionName: "Verse", lines: ["Code becomes melody tonight"] }];
}

function buildCompositionPlan(
  repoName: string,
  genre: string,
  params: MusicParams,
  lyrics: string,
  durationSeconds: number
): CompositionPlan {
  const rawSections = parseLyricsIntoSections(lyrics).map((section) => ({
    ...section,
    lines: section.lines.slice(0, 4),
  }));
  const totalDurationMs = Math.max(3000, durationSeconds * 1000);
  const baseDurationMs = Math.floor(totalDurationMs / rawSections.length);
  const remainderMs = totalDurationMs - baseDurationMs * rawSections.length;

  return {
    positive_global_styles: [
      genre,
      `${params.bpm} bpm`,
      params.energy,
      params.mood,
      params.timbre,
      params.scale,
      "fully sung lead vocals",
      "strong melody",
      "repo-personalized lyrics",
      `song inspired by repository ${repoName}`,
    ],
    negative_global_styles: [
      "spoken word",
      "voice over",
      "narration",
      "instrumental only",
      "monotone speech",
      "podcast delivery",
    ],
    sections: rawSections.map((section, index) => {
      const lowerName = section.sectionName.toLowerCase();
      const melodicFocus = lowerName.includes("chorus")
        ? ["big melodic hook", "anthemic sung chorus", "memorable topline"]
        : lowerName.includes("bridge")
          ? ["dynamic lift", "harmonic variation", "emotional turn"]
          : lowerName.includes("outro")
            ? ["emotional resolution", "sustained vocal melody", "gentle final refrain"]
            : ["story-driven sung verse", "clear vocal phrasing", "melodic lead vocal"];

      return {
        section_name: section.sectionName,
        positive_local_styles: [
          ...melodicFocus,
          `${genre} arrangement`,
          params.mood,
          params.rhythmStyle,
        ],
        negative_local_styles: [
          "spoken word",
          "dry narration",
          "robotic recitation",
        ],
        duration_ms: baseDurationMs + (index === rawSections.length - 1 ? remainderMs : 0),
        lines: section.lines,
      };
    }),
  };
}

async function generateSungMusicWithElevenMusic(
  repoName: string,
  genre: string,
  params: MusicParams,
  lyrics: string,
  durationSeconds: number
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const response = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      composition_plan: buildCompositionPlan(repoName, genre, params, lyrics, durationSeconds),
      model_id: "music_v1",
      respect_sections_durations: true,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs Music failed (${response.status}): ${err}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function generateAudioTrack(
  mode: "lyrical" | "instrumental",
  repoName: string,
  genre: string,
  params: MusicParams,
  durationSeconds: number,
  lyrics: string | null
): Promise<Buffer> {
  if (mode !== "lyrical") {
    return generateMusicWithElevenLabs(
      buildMusicPrompt(genre, params, "instrumental"),
      durationSeconds,
      0.4,
    );
  }

  if (!lyrics) {
    throw new Error(`Lyrics were not generated for ${repoName}.`);
  }

  return generateSungMusicWithElevenMusic(repoName, genre, params, lyrics, durationSeconds);
}

async function generateMusicWithElevenLabs(
  prompt: string,
  durationSeconds: number,
  promptInfluence = 0.4
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  // ElevenLabs Sound Generation API — max 22 seconds per request
  const clampedDuration = Math.min(durationSeconds, 22);

  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: clampedDuration,
      prompt_influence: promptInfluence,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs Sound Generation failed (${response.status}): ${err}`);
  }

  const buf1 = Buffer.from(await response.arrayBuffer());

  // For "full" mode, generate a second segment and concatenate the buffers
  if (durationSeconds > 22) {
    const response2 = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: Math.min(durationSeconds - 22, 22),
        prompt_influence: 0.4,
      }),
    });
    if (response2.ok) {
      const buf2 = Buffer.from(await response2.arrayBuffer());
      return Buffer.concat([buf1, buf2]);
    }
  }

  return buf1;
}

// ── Routes ─────────────────────────────────────────────────────────────────

router.post("/generate", async (req, res) => {
  const parse = GenerateSoundtrackBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid request body" });
    return;
  }

  const { mode, genre, generationType } = parse.data;
  const repoUrl = normalizeGitHubUrl(parse.data.repoUrl);

  if (!isValidGitHubUrl(repoUrl)) {
    res.status(400).json({ error: "INVALID_URL", message: "Please provide a valid GitHub repository URL (e.g. github.com/owner/repo)" });
    return;
  }

  const repoName = extractRepoName(repoUrl);
  const diskKey = audioDiskKey(repoUrl, genre, mode, generationType);

  try {
    // ── Cache-first: check DB for an existing soundtrack with identical params ──
    const existing = await db
      .select()
      .from(soundtracksTable)
      .where(
        and(
          eq(soundtracksTable.repoUrl, repoUrl),
          eq(soundtracksTable.genre, genre),
          eq(soundtracksTable.mode, mode),
          eq(soundtracksTable.generationType, generationType)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const cached = existing[0];
      const expectedAudioUrl = buildAudioUrl(cached.id, cached.mode);
      const requiresPipelineRefresh = !hasCurrentAudioPipeline(cached.audioUrl, cached.mode);
      req.log.info({ id: cached.id }, "Found cached soundtrack in DB");
      let cachedAudioError: string | null = null;

      if (requiresPipelineRefresh) {
        audioCache.delete(cached.id);
        req.log.info({ id: cached.id, mode: cached.mode }, "Cached soundtrack uses an older audio pipeline, refreshing");
      }

      // Try memory cache first (fastest)
      if (!audioCache.has(cached.id)) {
        // Try disk cache (persists across restarts)
        const diskAudio = await readAudioFromDisk(diskKey);
        if (diskAudio) {
          audioCache.set(cached.id, diskAudio);
          if (cached.audioUrl !== expectedAudioUrl) {
            await db.update(soundtracksTable)
              .set({ audioUrl: expectedAudioUrl })
              .where(eq(soundtracksTable.id, cached.id));
          }
          req.log.info({ id: cached.id }, "Loaded audio from disk into memory");
        } else {
          // Audio missing from both caches (old record pre-dating disk save, or /tmp cleared).
          // Regenerate the audio using the same params so the user always gets sound.
          req.log.info({ id: cached.id }, "Audio missing from disk — regenerating for cached record");
          try {
            // Scrape + analyse to rebuild the deterministic prompt
            let context = `Repository: ${cached.repoName}`;
            let github: GitHubStats = {
              stars: 0, forks: 0, sizeKb: 0, primaryLanguage: "Unknown",
              languages: {}, openIssues: 0, topics: [], watchersCount: 0,
              hasWiki: false, defaultBranch: "main",
            };
            const [ctxRes, ghRes] = await Promise.allSettled([
              scrapeRepoContext(cached.repoUrl, cached.repoName),
              fetchGitHubStats(cached.repoName),
            ]);
            if (ctxRes.status === "fulfilled" && ctxRes.value.length > 100) context = ctxRes.value;
            if (ghRes.status === "fulfilled") github = ghRes.value;

            const metrics = analyzeCodePatterns(context);
            const musicParams = codeMetricsToMusicParams(metrics, github, cached.genre);
            const cachedMode = (cached.mode || "instrumental") as "lyrical" | "instrumental";
            const duration = Math.min(cached.duration || 22, 22);

            const newAudio = await generateAudioTrack(
              cachedMode,
              cached.repoName,
              cached.genre,
              musicParams,
              duration,
              cached.lyrics,
            );
            audioCache.set(cached.id, newAudio);
            await writeAudioToDisk(diskKey, newAudio);
            await db.update(soundtracksTable)
              .set({ audioUrl: expectedAudioUrl })
              .where(eq(soundtracksTable.id, cached.id));
            req.log.info({ id: cached.id, bytes: newAudio.length }, "Audio regenerated and saved to disk");
          } catch (err) {
            cachedAudioError = buildAudioErrorMessage(err);
            req.log.warn({ err }, "Audio regeneration failed for cached record");
          }
        }
      }

      const hasAudio = audioCache.has(cached.id);
      res.json({
        id: String(cached.id),
        repoUrl: cached.repoUrl,
        repoName: cached.repoName,
        mode: cached.mode,
        genre: cached.genre,
        generationType: cached.generationType,
        lyrics: cached.lyrics,
        audioUrl: hasAudio ? expectedAudioUrl : null,
        duration: cached.duration,
        createdAt: cached.createdAt.toISOString(),
        cached: true,
        musicParams: cached.musicParams ? JSON.parse(cached.musicParams) : null,
        codeMetrics: cached.codeMetrics ? JSON.parse(cached.codeMetrics) : null,
        audioError: hasAudio ? null : cachedAudioError,
      });
      return;
    }

    // ── Step 1: Scrape repo deeply + fetch GitHub API stats in parallel ────────
    req.log.info({ repoUrl, repoName }, "Analyzing repo — Firecrawl + GitHub API");
    let context = `Repository: ${repoName}`;
    let github: GitHubStats = {
      stars: 0, forks: 0, sizeKb: 0, primaryLanguage: "Unknown",
      languages: {}, openIssues: 0, topics: [], watchersCount: 0,
      hasWiki: false, defaultBranch: "main",
    };

    const [contextResult, githubResult] = await Promise.allSettled([
      scrapeRepoContext(repoUrl, repoName),
      fetchGitHubStats(repoName),
    ]);

    if (contextResult.status === "fulfilled" && contextResult.value.length > 100) {
      context = contextResult.value;
      req.log.info({ contextLen: context.length }, "Firecrawl scrape succeeded");
    } else {
      req.log.warn("Firecrawl scrape failed, using repo name only");
    }

    if (githubResult.status === "fulfilled") {
      github = githubResult.value;
      req.log.info({
        stars: github.stars,
        forks: github.forks,
        sizeKb: github.sizeKb,
        language: github.primaryLanguage,
        langCount: Object.keys(github.languages).length,
      }, "GitHub API stats fetched");
    } else {
      req.log.warn("GitHub API fetch failed, using defaults");
    }

    // ── Step 2: Analyse real code patterns from scraped content ───────────────
    const metrics = analyzeCodePatterns(context);
    req.log.info({
      functions: metrics.functionCount,
      classes:   metrics.classCount,
      loops:     metrics.loopCount,
      conditionals: metrics.conditionalCount,
      async:     metrics.asyncCount,
      errorHandling: metrics.errorHandlingCount,
      totalLines: metrics.totalLines,
      nestingDepth: metrics.nestingDepth,
    }, "Code metrics extracted");

    // ── Step 3: Generate lyrics (lyrical mode) ────────────────────────────────
    let lyrics: string | null = null;
    if (mode === "lyrical") {
      req.log.info({ repoName, genre }, "Generating lyrics for lyrical mode");
      lyrics = await generateLyrics(repoName, genre, context, metrics, github);
      req.log.info({ lyricsLen: lyrics?.length }, "Lyrics generated");
    }

    // ── Step 4: Map code metrics → music parameters, then build prompt ─────────
    const musicParams = codeMetricsToMusicParams(metrics, github, genre);
    const songMode = mode as "lyrical" | "instrumental";
    req.log.info({ bpm: musicParams.bpm, mode }, "Music parameters built");

    // ── Step 5: Generate audio ─────────────────────────────────────────────────
    const duration = generationType === "quick" ? 22 : 44;
    req.log.info({ genre, duration, bpm: musicParams.bpm, mode }, "Generating audio with ElevenLabs");

    let audioBuffer: Buffer | null = null;
    let audioError: string | null = null;
    try {
      audioBuffer = await generateAudioTrack(
        songMode,
        repoName,
        genre,
        musicParams,
        duration,
        lyrics,
      );
      req.log.info(
        { bytes: audioBuffer.length, mode: songMode },
        songMode === "lyrical"
          ? "Lyrical track generated with vocals mixed over instrumental"
          : "ElevenLabs instrumental generated",
      );
    } catch (err) {
      audioError = buildAudioErrorMessage(err);
      req.log.warn({ err }, "Audio generation failed, continuing without audio");
    }

    // ── Step 4: Serialize analysis data for DB + response ─────────────────────
    const musicParamsJson = JSON.stringify(musicParams);
    const codeMetricsJson = JSON.stringify({
      functionCount:      metrics.functionCount,
      classCount:         metrics.classCount,
      loopCount:          metrics.loopCount,
      asyncCount:         metrics.asyncCount,
      errorHandlingCount: metrics.errorHandlingCount,
      totalLines:         metrics.totalLines,
      nestingDepth:       metrics.nestingDepth,
      stars:              github?.stars     ?? 0,
      forks:              github?.forks     ?? 0,
      primaryLanguage:    github?.primaryLanguage ?? "Unknown",
      sizeKb:             github?.sizeKb    ?? 0,
    });

    // ── Step 5: Save to DB ───────────────────────────────────────────────────
    const [soundtrack] = await db
      .insert(soundtracksTable)
      .values({
        repoUrl,
        repoName,
        mode,
        genre,
        generationType,
        lyrics,
        audioUrl: null,
        duration,
        musicParams: musicParamsJson,
        codeMetrics: codeMetricsJson,
      })
      .returning();

    // ── Step 6: Persist audio to disk + memory cache ─────────────────────────
    if (audioBuffer) {
      audioCache.set(soundtrack.id, audioBuffer);
      await writeAudioToDisk(diskKey, audioBuffer);
      await db
        .update(soundtracksTable)
        .set({ audioUrl: buildAudioUrl(soundtrack.id, mode) })
        .where(eq(soundtracksTable.id, soundtrack.id));
    }

    res.json({
      id: String(soundtrack.id),
      repoUrl: soundtrack.repoUrl,
      repoName: soundtrack.repoName,
      mode: soundtrack.mode,
      genre: soundtrack.genre,
      generationType: soundtrack.generationType,
      lyrics: soundtrack.lyrics,
      audioUrl: audioBuffer ? buildAudioUrl(soundtrack.id, soundtrack.mode) : null,
      duration: soundtrack.duration,
      createdAt: soundtrack.createdAt.toISOString(),
      cached: false,
      musicParams: musicParams,
      codeMetrics: JSON.parse(codeMetricsJson),
      audioError,
    });
  } catch (err) {
    req.log.error({ err }, "Generation failed");
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to generate soundtrack" });
  }
});

// Serve cached audio
router.get("/audio/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const audio = audioCache.get(id);
  if (!audio) {
    res.status(404).json({ error: "NOT_FOUND", message: "Audio not found or server was restarted" });
    return;
  }
  res.set({
    "Content-Type": "audio/mpeg",
    "Content-Length": String(audio.length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  });
  res.send(audio);
});

router.post("/share", async (req, res) => {
  const parse = CreateShareCardBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid request body" });
    return;
  }

  const { id, repoName, genre } = parse.data;
  const shareUrl = `${req.protocol}://${req.get("host")}/?soundtrack=${id}`;
  const shareText = `${repoName} has a soundtrack. Genre: ${genre} — generated by CodeTune.\n\n${shareUrl}`;

  res.json({ shareUrl, shareText });
});

export default router;

