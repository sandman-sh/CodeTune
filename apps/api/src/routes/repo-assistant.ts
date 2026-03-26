import { Router } from "express";
import FirecrawlApp from "@mendable/firecrawl-js";
import {
  ChatMessageBody,
  RepoAnalyzeBody,
  RepoAnalyzeResponse,
  VoiceSynthesizeBody,
  VoiceTranscribeBody,
} from "../../../../packages/api-zod/src/generated/api.js";

const router = Router();

const GEMINI_ANALYZE_MODEL = process.env.GEMINI_ANALYZE_MODEL || "gemini-2.0-flash";
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-2.0-flash";
const GEMINI_TRANSCRIBE_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-2.0-flash";
const ELEVENLABS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
const MAX_ANALYZE_CONTEXT = 24000;
const MAX_CHAT_CONTEXT = 12000;
const MAX_RELEVANT_FILE_CHARS = 7000;
const MAX_RELEVANT_FILES = 3;
const MAX_STRUCTURE_CONTEXT_CHARS = 4500;
const MAX_ARCHITECTURE_CONTEXT_CHARS = 6000;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

type AiProvider = "openrouter" | "deepseek" | "groq" | "gemini";

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
  body?: ReadableStream<Uint8Array> | null;
};

type RepoMetadata = {
  repoName: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  description: string;
  homepage: string;
  topics: string[];
  language: string;
};

type RepoTreeItem = {
  path: string;
  type: "blob" | "tree";
  size?: number;
};

const repoTreeCache = new Map<string, RepoTreeItem[]>();
const rawFileCache = new Map<string, string>();

type OpenAiLikeMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ProviderAttempt = {
  provider: AiProvider;
  status: "success" | "failed";
  error?: string;
};

type AnalyzedRepo = {
  repoName: string;
  repoDescription: string;
  codeDNA: {
    developerType: "solo" | "team" | "chaotic";
    codeStyle: "clean" | "messy" | "optimized";
    techStack: string[];
    complexityLevel: "Low" | "Medium" | "High";
    riskLevel: "Low" | "Medium" | "High";
  };
  summary: {
    whatItDoes: string;
    whoItsFor: string;
    howToRun: string;
    keyFiles: string[];
  };
  voiceIntro: string;
  rawContext: string;
};

const repoAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["repoDescription", "codeDNA", "summary", "voiceIntro"],
  properties: {
    repoDescription: { type: "string" },
    codeDNA: {
      type: "object",
      additionalProperties: false,
      required: ["developerType", "codeStyle", "techStack", "complexityLevel", "riskLevel"],
      properties: {
        developerType: { type: "string", enum: ["solo", "team", "chaotic"] },
        codeStyle: { type: "string", enum: ["clean", "messy", "optimized"] },
        techStack: {
          type: "array",
          items: { type: "string" },
        },
        complexityLevel: { type: "string", enum: ["Low", "Medium", "High"] },
        riskLevel: { type: "string", enum: ["Low", "Medium", "High"] },
      },
    },
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["whatItDoes", "whoItsFor", "howToRun", "keyFiles"],
      properties: {
        whatItDoes: { type: "string" },
        whoItsFor: { type: "string" },
        howToRun: { type: "string" },
        keyFiles: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    voiceIntro: { type: "string" },
  },
} as const;

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

function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return apiKey;
}

function getProviderApiKey(provider: Exclude<AiProvider, "gemini">): string {
  const apiKey =
    provider === "openrouter"
      ? process.env.OPENROUTER_API_KEY
      : provider === "deepseek"
      ? process.env.DEEPSEEK_API_KEY
      : process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()} API key is not set`);
  }

  return apiKey;
}

function getAvailableProviders(): AiProvider[] {
  const providers: AiProvider[] = [];
  if (process.env.OPENROUTER_API_KEY) providers.push("openrouter");
  if (process.env.DEEPSEEK_API_KEY) providers.push("deepseek");
  if (process.env.GROQ_API_KEY) providers.push("groq");
  if (process.env.GEMINI_API_KEY) providers.push("gemini");
  return providers;
}

function getProviderModel(provider: AiProvider): string {
  if (provider === "openrouter") return OPENROUTER_MODEL;
  if (provider === "deepseek") return DEEPSEEK_MODEL;
  if (provider === "groq") return GROQ_MODEL;
  return GEMINI_CHAT_MODEL;
}

function getProviderBaseUrl(provider: Exclude<AiProvider, "gemini">): string {
  if (provider === "openrouter") return "https://openrouter.ai/api/v1/chat/completions";
  if (provider === "deepseek") return "https://api.deepseek.com/chat/completions";
  return "https://api.groq.com/openai/v1/chat/completions";
}

function getFirecrawlClient(): FirecrawlApp {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY is not set");
  }
  return new FirecrawlApp({ apiKey });
}

function extractRepoParts(repoUrl: string): { owner: string; repo: string; repoName: string } {
  const url = new URL(repoUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Invalid GitHub repository URL.");
  }
  return {
    owner: parts[0],
    repo: parts[1],
    repoName: `${parts[0]}/${parts[1]}`,
  };
}

function truncateText(input: string, maxLength: number): string {
  return input.length > maxLength ? input.slice(0, maxLength) : input;
}

function stripDataUrlPrefix(base64: string): string {
  return base64.replace(/^data:[^;]+;base64,/, "");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizePath(pathValue: string): string {
  return pathValue.replace(/^\.?\//, "");
}

async function geminiGenerateContent(
  model: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const apiKey = getGeminiApiKey();
  const responseRaw = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    },
  );
  const response = responseRaw as FetchResponseLike;
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${message}`);
  }

  return response.json();
}

async function openAiCompatibleGenerateContent(
  provider: Exclude<AiProvider, "gemini">,
  payload: {
    model: string;
    messages: OpenAiLikeMessage[];
    temperature?: number;
    response_format?: { type: "json_object" };
  },
): Promise<string> {
  const apiKey = getProviderApiKey(provider);
  const responseRaw = await fetch(getProviderBaseUrl(provider), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      ...(provider === "openrouter"
        ? {
            "HTTP-Referer": "https://thecodetune.vercel.app",
            "X-Title": "CodeTune",
          }
        : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  });
  const response = responseRaw as FetchResponseLike;
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${provider} request failed (${response.status}): ${message}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string; type?: string }> } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((entry) => (typeof entry?.text === "string" ? entry.text : ""))
      .join("")
      .trim();
  }
  return "";
}

async function openAiCompatibleStreamGenerateContent(
  provider: Exclude<AiProvider, "gemini">,
  payload: {
    model: string;
    messages: OpenAiLikeMessage[];
    temperature?: number;
  },
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = getProviderApiKey(provider);
  const responseRaw = await fetch(getProviderBaseUrl(provider), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      ...(provider === "openrouter"
        ? {
            "HTTP-Referer": "https://thecodetune.vercel.app",
            "X-Title": "CodeTune",
          }
        : {}),
    },
    body: JSON.stringify({
      ...payload,
      stream: true,
    }),
    signal: AbortSignal.timeout(45000),
  });
  const response = responseRaw as FetchResponseLike;
  if (!response.ok || !response.body) {
    const message = await response.text();
    throw new Error(`${provider} stream request failed (${response.status}): ${message}`);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let completeText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const eventChunk = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);

      const lines = eventChunk.split("\n").map((line) => line.trim()).filter(Boolean);
      const dataLines = lines.filter((line) => line.startsWith("data:"));
      const dataText = dataLines.map((line) => line.slice(5).trim()).join("");

      if (!dataText || dataText === "[DONE]") {
        boundary = buffer.indexOf("\n\n");
        continue;
      }

      try {
        const parsed = JSON.parse(dataText) as {
          choices?: Array<{ delta?: { content?: string | Array<{ text?: string }> } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        const chunkText =
          typeof delta === "string"
            ? delta
            : Array.isArray(delta)
            ? delta.map((entry) => (typeof entry?.text === "string" ? entry.text : "")).join("")
            : "";
        if (chunkText) {
          completeText += chunkText;
          onChunk(chunkText);
        }
      } catch {
        // Ignore malformed partial events and continue.
      }

      boundary = buffer.indexOf("\n\n");
    }
  }

  return completeText.trim();
}

async function geminiStreamGenerateContent(
  model: string,
  payload: Record<string, unknown>,
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = getGeminiApiKey();
  const responseRaw = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    },
  );
  const response = responseRaw as FetchResponseLike;
  if (!response.ok || !response.body) {
    const message = await response.text();
    throw new Error(`Gemini stream request failed (${response.status}): ${message}`);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let completeText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const eventChunk = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);

      const lines = eventChunk.split("\n").map((line) => line.trim()).filter(Boolean);
      const dataLines = lines.filter((line) => line.startsWith("data:"));
      if (!dataLines.length) {
        boundary = buffer.indexOf("\n\n");
        continue;
      }

      const dataText = dataLines.map((line) => line.slice(5).trim()).join("");
      if (!dataText || dataText === "[DONE]") {
        boundary = buffer.indexOf("\n\n");
        continue;
      }

      try {
        const parsed = JSON.parse(dataText);
        const chunkText = extractGeminiText(parsed);
        if (chunkText) {
          completeText += chunkText;
          onChunk(chunkText);
        }
      } catch {
        // Ignore malformed partial events and continue streaming.
      }

      boundary = buffer.indexOf("\n\n");
    }
  }

  return completeText.trim();
}

function extractGeminiText(data: unknown): string {
  const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates;
  const parts = candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function extractFirstJsonObject(text: string): string {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

function normalizeArrayOfStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeAnalysisPayload(raw: unknown, metadata: RepoMetadata, rawContext: string, files: Array<{ path: string; content: string }>) {
  const source = (raw as Record<string, unknown>) || {};
  const codeDna = (source.codeDNA as Record<string, unknown>) || {};
  const summary = (source.summary as Record<string, unknown>) || {};

  const normalized = {
    repoName: metadata.repoName,
    repoDescription:
      typeof source.repoDescription === "string" && source.repoDescription.trim()
        ? source.repoDescription.trim()
        : metadata.description || `A ${metadata.language} repository.`,
    codeDNA: {
      developerType:
        codeDna.developerType === "team" || codeDna.developerType === "chaotic" ? codeDna.developerType : "solo",
      codeStyle:
        codeDna.codeStyle === "messy" || codeDna.codeStyle === "optimized" ? codeDna.codeStyle : "clean",
      techStack: normalizeArrayOfStrings(codeDna.techStack).length
        ? normalizeArrayOfStrings(codeDna.techStack)
        : [metadata.language || "Unknown"],
      complexityLevel:
        codeDna.complexityLevel === "Medium" || codeDna.complexityLevel === "High" ? codeDna.complexityLevel : "Low",
      riskLevel:
        codeDna.riskLevel === "Medium" || codeDna.riskLevel === "High" ? codeDna.riskLevel : "Low",
    },
    summary: {
      whatItDoes:
        typeof summary.whatItDoes === "string" && summary.whatItDoes.trim()
          ? summary.whatItDoes.trim()
          : typeof source.summary === "string" && source.summary.trim()
          ? source.summary.trim()
          : metadata.description || "This repository contains application code and documentation.",
      whoItsFor:
        typeof summary.whoItsFor === "string" && summary.whoItsFor.trim()
          ? summary.whoItsFor.trim()
          : "Developers evaluating, extending, or running this project.",
      howToRun:
        typeof summary.howToRun === "string" && summary.howToRun.trim()
          ? summary.howToRun.trim()
          : "Read the README, install dependencies, and follow the project-specific setup commands listed there.",
      keyFiles: normalizeArrayOfStrings(summary.keyFiles).length
        ? normalizeArrayOfStrings(summary.keyFiles)
        : files.map((file) => file.path).slice(0, 8),
    },
    voiceIntro:
      typeof source.voiceIntro === "string" && source.voiceIntro.trim()
        ? source.voiceIntro.trim()
        : `Hey, I am ${metadata.repoName}. I can help you understand this repository, how it runs, and what the important files are.`,
    rawContext,
  };

  return RepoAnalyzeResponse.parse(normalized);
}

function chunkText(text: string, size = 32): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks.length ? chunks : [text];
}

function parseRepoStructure(repoContext: string) {
  const lines = repoContext.split("\n").map((line) => line.trim()).filter(Boolean);
  const topLevelDirectoriesLine = lines.find((line) => line.startsWith("Top-level directories:"));
  const notableFilesLine = lines.find((line) => line.startsWith("Notable files:"));
  const fileCountLine = lines.find((line) => line.startsWith("Repository file count:"));

  return {
    lines,
    topLevelDirectories: topLevelDirectoriesLine
      ? topLevelDirectoriesLine.replace(/^Top-level directories:\s*/, "").split(",").map((entry) => entry.trim()).filter(Boolean)
      : [],
    notableFiles: notableFilesLine
      ? notableFilesLine.replace(/^Notable files:\s*/, "").split(",").map((entry) => entry.trim()).filter(Boolean)
      : [],
    fileCount: fileCountLine ? Number(fileCountLine.replace(/^Repository file count:\s*/, "").trim()) : null,
  };
}

function buildFallbackChatReply(repoName: string, repoContext: string, message: string): string {
  const lowerMessage = message.toLowerCase();
  const structure = parseRepoStructure(repoContext);
  const lines = structure.lines;
  const description = lines.find((line) => line.startsWith("Description:"))?.replace(/^Description:\s*/, "");
  const language = lines.find((line) => line.startsWith("Primary language:"))?.replace(/^Primary language:\s*/, "");
  const hasReadme = lines.some((line) => line.toLowerCase().includes("readme markdown"));

  if (
    lowerMessage.includes("how many file") ||
    lowerMessage.includes("number of file") ||
    lowerMessage.includes("file count")
  ) {
    return [
      `${repoName} is answering from the repo context fallback.`,
      structure.fileCount !== null ? `I found about ${structure.fileCount} files in the repository tree.` : "I could not determine the exact file count from the current repo snapshot.",
      structure.topLevelDirectories.length ? `Top-level folders: ${structure.topLevelDirectories.join(", ")}.` : "",
      structure.notableFiles.length ? `Notable files: ${structure.notableFiles.slice(0, 8).join(", ")}.` : "",
    ].filter(Boolean).join(" ");
  }

  if (
    (lowerMessage.includes("list") || lowerMessage.includes("show")) &&
    (lowerMessage.includes("folder") || lowerMessage.includes("directory") || lowerMessage.includes("file"))
  ) {
    return [
      `${repoName} is answering from the repo context fallback.`,
      structure.topLevelDirectories.length ? `Top-level folders: ${structure.topLevelDirectories.join(", ")}.` : "I could not extract a top-level folder list from the current repo snapshot.",
      structure.notableFiles.length ? `Notable files I found: ${structure.notableFiles.slice(0, 10).join(", ")}.` : "",
      structure.fileCount !== null ? `Total file count in the tree snapshot: ${structure.fileCount}.` : "",
    ].filter(Boolean).join(" ");
  }

  if (lowerMessage.includes("run") || lowerMessage.includes("install")) {
    return [
      `${repoName} is answering from the repo context fallback.`,
      description ? `What it looks like: ${description}` : "",
      "Best next step: open the README and package manifest, then follow the install and run commands listed there.",
      language && language !== "Unknown" ? `Primary language: ${language}.` : "",
    ].filter(Boolean).join(" ");
  }

  if (lowerMessage.includes("architecture") || lowerMessage.includes("structure")) {
    return [
      `${repoName} is answering from the repo context fallback.`,
      description ? `Core summary: ${description}` : "",
      structure.topLevelDirectories.length ? `Top-level folders: ${structure.topLevelDirectories.join(", ")}.` : "",
      structure.notableFiles.length ? `Notable files: ${structure.notableFiles.slice(0, 8).join(", ")}.` : "",
      hasReadme ? "The README looks like the best source of architecture notes." : "The scraped context is light, so inspect the entry files and README first.",
    ].filter(Boolean).join(" ");
  }

  return [
    `${repoName} is currently responding from fallback repo context.`,
    description ? `Repo summary: ${description}` : "",
    "Ask about setup, architecture, or debugging and I will answer from the available README and metadata context.",
  ].filter(Boolean).join(" ");
}

async function fetchGitHubJson<T>(path: string): Promise<T | null> {
  try {
    const responseRaw = await fetch(`https://api.github.com${path}`, {
      headers: {
        "User-Agent": "CodeTune/1.0",
        "Accept": "application/vnd.github.v3+json",
      },
      signal: AbortSignal.timeout(12000),
    });
    const response = responseRaw as FetchResponseLike;
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function buildRepoMetadataFromName(repoName: string): RepoMetadata {
  const [owner = "", repo = ""] = repoName.split("/");
  return {
    owner,
    repo,
    repoName,
    defaultBranch: "main",
    description: "",
    homepage: "",
    topics: [],
    language: "Unknown",
  };
}

async function fetchRepoMetadata(repoUrl: string): Promise<RepoMetadata> {
  const { owner, repo, repoName } = extractRepoParts(repoUrl);
  const repoData = await fetchGitHubJson<{
    default_branch?: string;
    description?: string | null;
    homepage?: string | null;
    topics?: string[];
    language?: string | null;
  }>(`/repos/${repoName}`);

  return {
    owner,
    repo,
    repoName,
    defaultBranch: repoData?.default_branch || "main",
    description: repoData?.description || "",
    homepage: repoData?.homepage || "",
    topics: repoData?.topics || [],
    language: repoData?.language || "Unknown",
  };
}

async function fetchRepoTree(metadata: RepoMetadata): Promise<RepoTreeItem[]> {
  const cacheKey = `${metadata.repoName}@${metadata.defaultBranch}`;
  const cached = repoTreeCache.get(cacheKey);
  if (cached) return cached;

  const treeData = await fetchGitHubJson<{ tree?: RepoTreeItem[] }>(
    `/repos/${metadata.repoName}/git/trees/${metadata.defaultBranch}?recursive=1`,
  );

  const tree = treeData?.tree || [];
  repoTreeCache.set(cacheKey, tree);
  return tree;
}

async function scrapeMarkdown(url: string): Promise<string> {
  try {
    const firecrawl = getFirecrawlClient();
    const result = await (firecrawl as any).v1.scrapeUrl(url, {
      formats: ["markdown"],
      onlyMainContent: true,
      timeout: 15000,
    });

    const markdown = typeof result?.data?.markdown === "string" ? result.data.markdown : "";
    return markdown.trim();
  } catch {
    return "";
  }
}

async function scrapeRepoPages(repoUrl: string, branch: string): Promise<{ mainPage: string; readme: string }> {
  const readmeCandidates = uniqueStrings([
    `${repoUrl}/blob/${branch}/README.md`,
    `${repoUrl}/blob/main/README.md`,
    `${repoUrl}/blob/master/README.md`,
  ]);

  const [mainPage, ...readmes] = await Promise.all([
    scrapeMarkdown(repoUrl),
    ...readmeCandidates.map((candidate) => scrapeMarkdown(candidate)),
  ]);

  return {
    mainPage,
    readme: readmes.find((entry) => entry.length > 0) || "",
  };
}

function pickImportantFiles(tree: RepoTreeItem[]): string[] {
  const candidateFiles = tree.filter((item) => item.type === "blob" && !item.path.includes("node_modules"));
  const sourceFilePattern = /\.(ts|tsx|js|jsx|py|rs|go|java|kt|swift|rb|php|cs|json|toml|ya?ml|md|sh)$/i;

  const ranked = candidateFiles
    .filter((item) => sourceFilePattern.test(item.path))
    .map((item) => {
      const filePath = normalizePath(item.path);
      const lower = filePath.toLowerCase();
      let score = 0;

      if (/^readme/i.test(lower)) score += 120;
      if (/^package\.json$/.test(lower)) score += 110;
      if (/^pnpm-lock\.yaml$/.test(lower) || /^package-lock\.json$/.test(lower)) score += 55;
      if (/^tsconfig.*\.json$/.test(lower)) score += 80;
      if (/^vite\.config\./.test(lower) || /^next\.config\./.test(lower) || /^tailwind\.config\./.test(lower)) score += 80;
      if (/^dockerfile$/.test(lower) || /^docker-compose/.test(lower)) score += 75;
      if (/^requirements\.txt$/.test(lower) || /^pyproject\.toml$/.test(lower) || /^cargo\.toml$/.test(lower) || /^go\.mod$/.test(lower)) score += 85;
      if (/^src\/(main|index|app)\./.test(lower) || /^app\/page\./.test(lower)) score += 100;
      if (/^(server|api|lib|components|pages|routes|cmd|internal|pkg)\//.test(lower)) score += 45;
      if (/\.(tsx?|jsx?)$/.test(lower)) score += 35;
      if (/\.(py|rs|go|java|kt|swift|rb|php|cs)$/.test(lower)) score += 35;
      if (/test|spec/.test(lower)) score -= 20;
      if ((item.size || 0) > 150000) score -= 25;
      score -= Math.min(filePath.split("/").length * 2, 12);

      return { path: filePath, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.path);

  return uniqueStrings(ranked).slice(0, 12);
}

function buildRepoTreeSummary(tree: RepoTreeItem[]): string {
  const directories = uniqueStrings(
    tree
      .map((item) => normalizePath(item.path).split("/").slice(0, -1).join("/"))
      .filter(Boolean),
  );

  const topLevelDirectories = directories
    .filter((directory) => !directory.includes("/"))
    .slice(0, 12);

  const notableFiles = pickImportantFiles(tree).slice(0, 10);

  return [
    topLevelDirectories.length ? `Top-level directories: ${topLevelDirectories.join(", ")}` : "",
    notableFiles.length ? `Notable files: ${notableFiles.join(", ")}` : "",
    `Repository file count: ${tree.filter((item) => item.type === "blob").length}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchImportantFileSamples(metadata: RepoMetadata): Promise<{ files: Array<{ path: string; content: string }>; treeSummary: string }> {
  const tree = await fetchRepoTree(metadata);
  const treeSummary = buildRepoTreeSummary(tree);
  const selectedPaths = pickImportantFiles(tree);
  const files = await Promise.all(
    selectedPaths.map(async (filePath) => {
      try {
        const responseRaw = await fetch(
          `https://raw.githubusercontent.com/${metadata.repoName}/${metadata.defaultBranch}/${filePath}`,
          { signal: AbortSignal.timeout(12000) },
        );
        const response = responseRaw as FetchResponseLike;
        if (!response.ok) {
          return null;
        }
        const content = truncateText(await response.text(), 2500);
        return content.trim() ? { path: filePath, content } : null;
      } catch {
        return null;
      }
    }),
  );

  return {
    files: files.filter((file): file is { path: string; content: string } => Boolean(file)),
    treeSummary,
  };
}

function extractMentionedPaths(message: string): string[] {
  const matches = message.match(/[`'"]?([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)[`'"]?/g) || [];
  return uniqueStrings(
    matches
      .map((match) => match.replace(/[`'"]/g, "").trim())
      .filter((match) => match.includes(".")),
  );
}

function extractMessageTokens(message: string): string[] {
  return uniqueStrings(
    message
      .toLowerCase()
      .split(/[^a-z0-9./_-]+/)
      .filter((entry) => entry.length >= 3),
  );
}

function isStructureQuestion(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("structure") ||
    lower.includes("folder") ||
    lower.includes("directory") ||
    lower.includes("file tree") ||
    lower.includes("file count") ||
    lower.includes("how many file") ||
    ((lower.includes("show") || lower.includes("list")) && (lower.includes("file") || lower.includes("folder")))
  );
}

function isArchitectureQuestion(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("architecture") ||
    lower.includes("organize") ||
    lower.includes("organised") ||
    lower.includes("organized") ||
    lower.includes("structure") ||
    lower.includes("codebase") ||
    lower.includes("how does this repo work") ||
    lower.includes("how is this repo built")
  );
}

function scoreArchitecturePath(filePath: string): number {
  const lower = normalizePath(filePath).toLowerCase();
  let score = 0;
  if (/^architecture\.md$/.test(lower) || /(^|\/)architecture\.md$/.test(lower)) score += 150;
  if (/(^|\/)(docs|doc)\/.*architecture/i.test(lower)) score += 135;
  if (/^package\.json$/.test(lower) || /^pnpm-workspace\.yaml$/.test(lower)) score += 120;
  if (/^taskfile\.ya?ml$/.test(lower) || /^makefile$/.test(lower) || /^compose\.ya?ml$/.test(lower)) score += 110;
  if (/^readme\.md$/.test(lower)) score += 110;
  if (/^dockerfile$/.test(lower) || /^docker-compose/.test(lower)) score += 95;
  if (/^tsconfig.*\.json$/.test(lower) || /^vite\.config\./.test(lower) || /^next\.config\./.test(lower)) score += 95;
  if (/^src\/(main|index|app|server|router)\./.test(lower)) score += 105;
  if (/^(src|app|server|api|routes|lib|components|pages|cmd|internal|pkg)\//.test(lower)) score += 55;
  if (/config|settings|schema|middleware|controller|service/.test(lower)) score += 35;
  if (/test|spec|fixture|mock/.test(lower)) score -= 25;
  if ((lower.match(/\//g) || []).length <= 1) score += 12;
  return score;
}

function selectArchitectureFiles(tree: RepoTreeItem[]): string[] {
  return uniqueStrings(
    tree
      .filter((item) => item.type === "blob")
      .map((item) => normalizePath(item.path))
      .map((filePath) => ({ path: filePath, score: scoreArchitecturePath(filePath) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.path),
  ).slice(0, MAX_RELEVANT_FILES);
}

function buildArchitectureContext(message: string, tree: RepoTreeItem[]): { context: string; loaded: string[] } {
  if (!isArchitectureQuestion(message)) {
    return { context: "", loaded: [] };
  }

  const blobPaths = tree
    .filter((item) => item.type === "blob")
    .map((item) => normalizePath(item.path));
  const directories = uniqueStrings(
    blobPaths
      .map((filePath) => filePath.split("/").slice(0, -1).join("/"))
      .filter(Boolean),
  );
  const topLevelDirectories = directories.filter((directory) => !directory.includes("/")).slice(0, 12);
  const importantFiles = blobPaths
    .map((filePath) => ({ path: filePath, score: scoreArchitecturePath(filePath) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.path)
    .slice(0, 14);

  const architecturalDirectories = uniqueStrings(
    directories
      .filter((directory) =>
        /^(src|app|server|api|routes|components|pages|lib|cmd|internal|pkg)(\/|$)/i.test(directory),
      )
      .slice(0, 8),
  );

  const directorySections = architecturalDirectories.map((directory) => {
    const children = blobPaths
      .filter((filePath) => filePath.startsWith(`${directory}/`))
      .slice(0, 10);
    return `Area: ${directory}\n${children.join("\n")}`;
  });

  const entrypoints = importantFiles.filter((filePath) =>
    /(^package\.json$|^readme\.md$|^src\/(main|index|app|server|router)\.|^app\/page\.|^server\/|^api\/|^routes\/)/i.test(filePath),
  );

  const context = truncateText(
    [
      "Architecture-oriented repository snapshot:",
      topLevelDirectories.length ? `Top-level directories: ${topLevelDirectories.join(", ")}` : "",
      entrypoints.length ? `Likely entrypoints and config files: ${entrypoints.join(", ")}` : "",
      importantFiles.length ? `Important architectural files: ${importantFiles.join(", ")}` : "",
      directorySections.length ? directorySections.join("\n\n") : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    MAX_ARCHITECTURE_CONTEXT_CHARS,
  );

  return {
    context,
    loaded: uniqueStrings([...topLevelDirectories, ...importantFiles.slice(0, 8), ...architecturalDirectories]),
  };
}

function selectRelevantFiles(message: string, tree: RepoTreeItem[]): string[] {
  const fileItems = tree.filter((item) => item.type === "blob");
  const lowerMessage = message.toLowerCase();
  const mentionedPaths = extractMentionedPaths(message).map((entry) => normalizePath(entry).toLowerCase());
  const intentBoosts = [
    lowerMessage.includes("run") || lowerMessage.includes("install") ? ["package.json", "requirements.txt", "pyproject.toml", "cargo.toml", "go.mod", "dockerfile", "docker-compose.yml", "README.md"] : [],
    lowerMessage.includes("config") ? ["tsconfig.json", "vite.config.ts", ".env.example", "tailwind.config.ts", "next.config.js"] : [],
    lowerMessage.includes("route") || lowerMessage.includes("api") ? ["routes", "api", "server", "controller"] : [],
  ].flat();

  const ranked = fileItems
    .map((item) => {
      const normalized = normalizePath(item.path);
      const lowerPath = normalized.toLowerCase();
      const baseName = lowerPath.split("/").pop() || lowerPath;
      let score = 0;

      for (const mention of mentionedPaths) {
        if (lowerPath === mention) score += 200;
        else if (lowerPath.endsWith(`/${mention}`)) score += 160;
        else if (baseName === mention) score += 140;
        else if (lowerPath.includes(mention)) score += 90;
      }

      for (const boost of intentBoosts) {
        if (boost.includes("/") ? lowerPath.includes(boost) : baseName === boost.toLowerCase() || lowerPath.includes(boost.toLowerCase())) {
          score += 45;
        }
      }

      const pathTokens = lowerPath.split(/[/.\\_-]+/).filter(Boolean);
      for (const token of uniqueStrings(lowerMessage.split(/[^a-z0-9.]+/).filter((entry) => entry.length >= 3))) {
        if (baseName.includes(token)) score += 20;
        if (pathTokens.includes(token)) score += 12;
      }

      if (/readme\.md$/i.test(normalized)) score += 10;
      if ((item.size || 0) > 120000) score -= 15;

      return { path: normalized, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return uniqueStrings(ranked.map((item) => item.path)).slice(0, MAX_RELEVANT_FILES);
}

async function fetchRawFileContent(metadata: RepoMetadata, filePath: string): Promise<string> {
  const normalized = normalizePath(filePath);
  const cacheKey = `${metadata.repoName}@${metadata.defaultBranch}:${normalized}`;
  const cached = rawFileCache.get(cacheKey);
  if (cached) return cached;

  const responseRaw = await fetch(
    `https://raw.githubusercontent.com/${metadata.repoName}/${metadata.defaultBranch}/${normalized}`,
    { signal: AbortSignal.timeout(12000) },
  );
  const response = responseRaw as FetchResponseLike;
  if (!response.ok) {
    throw new Error(`Could not fetch raw file: ${normalized}`);
  }

  const content = truncateText(await response.text(), Math.ceil(MAX_RELEVANT_FILE_CHARS / MAX_RELEVANT_FILES)).trim();
  rawFileCache.set(cacheKey, content);
  return content;
}

function buildLiveStructureContext(message: string, tree: RepoTreeItem[]): { context: string; loaded: string[] } {
  if (!isStructureQuestion(message)) {
    return { context: "", loaded: [] };
  }

  const blobPaths = tree.filter((item) => item.type === "blob").map((item) => normalizePath(item.path));
  const directories = uniqueStrings(
    blobPaths
      .map((filePath) => filePath.split("/").slice(0, -1).join("/"))
      .filter(Boolean),
  );
  const topLevelDirectories = directories.filter((directory) => !directory.includes("/")).slice(0, 15);
  const topLevelFiles = blobPaths.filter((filePath) => !filePath.includes("/")).slice(0, 15);
  const tokens = extractMessageTokens(message);

  const matchingDirectories = directories
    .filter((directory) => tokens.some((token) => directory.toLowerCase().includes(token)))
    .slice(0, 4);

  const matchingDirectorySections = matchingDirectories.map((directory) => {
    const children = blobPaths
      .filter((filePath) => filePath.startsWith(`${directory}/`))
      .slice(0, 12);
    return `Folder: ${directory}\n${children.join("\n")}`;
  });

  const notableFiles = pickImportantFiles(tree).slice(0, 12);
  const loaded = uniqueStrings([
    ...matchingDirectories,
    ...notableFiles.slice(0, 6),
  ]);

  const context = truncateText(
    [
      `Live repository structure snapshot:`,
      `Total files: ${blobPaths.length}`,
      topLevelDirectories.length ? `Top-level directories: ${topLevelDirectories.join(", ")}` : "",
      topLevelFiles.length ? `Top-level files: ${topLevelFiles.join(", ")}` : "",
      notableFiles.length ? `Notable files: ${notableFiles.join(", ")}` : "",
      matchingDirectorySections.length ? matchingDirectorySections.join("\n\n") : "",
    ].filter(Boolean).join("\n\n"),
    MAX_STRUCTURE_CONTEXT_CHARS,
  );

  return { context, loaded };
}

async function fetchRelevantFileContext(repoName: string, message: string): Promise<{ context: string; loaded: string[] }> {
  const baseMetadata = buildRepoMetadataFromName(repoName);
  const metadata = {
    ...(await fetchRepoMetadata(`https://github.com/${repoName}`).catch(() => baseMetadata)),
  };
  const tree = await fetchRepoTree(metadata);
  const structureContext = buildLiveStructureContext(message, tree);
  const architectureContext = buildArchitectureContext(message, tree);
  const selectedFiles = uniqueStrings([
    ...selectRelevantFiles(message, tree),
    ...(isArchitectureQuestion(message) ? selectArchitectureFiles(tree) : []),
  ]).slice(0, MAX_RELEVANT_FILES);

  if (!selectedFiles.length) {
    return {
      context: [architectureContext.context, structureContext.context].filter(Boolean).join("\n\n"),
      loaded: uniqueStrings([...architectureContext.loaded, ...structureContext.loaded]),
    };
  }

  const fileChunks = await Promise.all(
    selectedFiles.map(async (filePath) => {
      try {
        const content = await fetchRawFileContent(metadata, filePath);
        return content ? `File: ${filePath}\n${content}` : "";
      } catch {
        return "";
      }
    }),
  );

  const combined = fileChunks.filter(Boolean).join("\n\n");
  const contextParts = [architectureContext.context, structureContext.context];
  if (combined.trim()) {
    contextParts.push(truncateText(`Relevant raw file context:\n${combined}`, MAX_RELEVANT_FILE_CHARS));
  }

  return {
    context: contextParts.filter(Boolean).join("\n\n"),
    loaded: uniqueStrings([...architectureContext.loaded, ...structureContext.loaded, ...selectedFiles]),
  };
}

function buildRawContext(
  metadata: RepoMetadata,
  mainPage: string,
  readme: string,
  treeSummary: string,
  files: Array<{ path: string; content: string }>,
): string {
  const sections = [
    `Repository: ${metadata.repoName}`,
    `Description: ${metadata.description || "No GitHub description provided."}`,
    `Primary language: ${metadata.language}`,
    metadata.topics.length ? `Topics: ${metadata.topics.join(", ")}` : "",
    metadata.homepage ? `Homepage: ${metadata.homepage}` : "",
    treeSummary ? `Repository structure:\n${treeSummary}` : "",
    mainPage ? `Repo page markdown:\n${mainPage}` : "",
    readme ? `README markdown:\n${readme}` : "",
    files.length
      ? `Important code samples:\n${files
          .map((file) => `File: ${file.path}\n${file.content}`)
          .join("\n\n")}`
      : "",
  ].filter(Boolean);

  return truncateText(sections.join("\n\n"), MAX_ANALYZE_CONTEXT);
}

function estimateRiskLevel(rawContext: string): "Low" | "Medium" | "High" {
  const lower = rawContext.toLowerCase();
  const riskSignals = ["todo", "hack", "fixme", "beta", "experimental", "deprecated", "unsafe", "panic", "workaround"];
  const score = riskSignals.filter((signal) => lower.includes(signal)).length;
  if (score >= 4) return "High";
  if (score >= 2) return "Medium";
  return "Low";
}

function estimateComplexity(rawContext: string): "Low" | "Medium" | "High" {
  const lower = rawContext.toLowerCase();
  const functionCount = (lower.match(/\b(function|def|fn|func|class|interface)\b/g) || []).length;
  const branchingCount = (lower.match(/\b(if|switch|case|try|catch|await|promise|async)\b/g) || []).length;
  const total = functionCount + branchingCount;
  if (total >= 60) return "High";
  if (total >= 20) return "Medium";
  return "Low";
}

function buildFallbackAnalysis(metadata: RepoMetadata, rawContext: string, files: Array<{ path: string; content: string }>): AnalyzedRepo {
  const techStack = uniqueStrings([
    metadata.language,
    ...metadata.topics,
    ...files.flatMap((file) => {
      const lower = file.content.toLowerCase();
      return [
        lower.includes("react") ? "React" : "",
        lower.includes("next") ? "Next.js" : "",
        lower.includes("express") ? "Express" : "",
        lower.includes("tailwind") ? "Tailwind CSS" : "",
        lower.includes("postgres") ? "Postgres" : "",
        lower.includes("docker") ? "Docker" : "",
      ];
    }),
  ]).slice(0, 6);

  return {
    repoName: metadata.repoName,
    repoDescription: metadata.description || `A ${metadata.language} repository with ${files.length} notable code files.`,
    codeDNA: {
      developerType: files.length <= 2 ? "solo" : "team",
      codeStyle: rawContext.toLowerCase().includes("optimiz") ? "optimized" : "clean",
      techStack: techStack.length ? techStack : [metadata.language],
      complexityLevel: estimateComplexity(rawContext),
      riskLevel: estimateRiskLevel(rawContext),
    },
    summary: {
      whatItDoes: metadata.description || "This repository includes application code, documentation, and setup details scraped from GitHub.",
      whoItsFor: "Developers evaluating, extending, or running this project.",
      howToRun: "Read the README, install dependencies, and follow the project-specific setup commands listed there.",
      keyFiles: files.map((file) => file.path),
    },
    voiceIntro: `I am ${metadata.repoName}. I turn ${metadata.language} code and README clues into a guided walkthrough so you can understand what I do and how to work with me.`,
    rawContext,
  };
}

function buildChatStyleInstruction(): string {
  return [
    "Keep replies concise by default.",
    "Unless the user explicitly asks for detail, answer in 3 to 6 short sentences or 3 to 5 short bullets.",
    "Focus on the most relevant part of the repo instead of giving a full tour.",
    "Mention only the key files or folders that support the answer.",
    "If the user asks for architecture, summarize the structure at a high level first and avoid long exhaustive lists.",
    "Only expand into a longer explanation when the user explicitly asks for deep detail, a full walkthrough, or step-by-step debugging.",
  ].join(" ");
}

async function analyzeRepoWithGemini(metadata: RepoMetadata, rawContext: string, files: Array<{ path: string; content: string }>): Promise<AnalyzedRepo> {
  const data = await geminiGenerateContent(GEMINI_ANALYZE_MODEL, {
    system_instruction: {
      parts: [
        {
          text:
            "You analyze GitHub repositories and return only JSON matching the provided schema. Infer code personality from README, metadata, and file samples. Keep outputs concrete and useful for people trying to install, run, or debug the repo.",
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              `Repository: ${metadata.repoName}`,
              metadata.description ? `GitHub description: ${metadata.description}` : "",
              metadata.language !== "Unknown" ? `Primary language: ${metadata.language}` : "",
              metadata.topics.length ? `Topics: ${metadata.topics.join(", ")}` : "",
              files.length ? `Important files: ${files.map((file) => file.path).join(", ")}` : "",
              "Analyze this repository context and fill the schema.",
              rawContext,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.35,
      response_mime_type: "application/json",
      response_schema: repoAnalysisSchema,
    },
  });

  const content = extractGeminiText(data);
  if (!content) {
    throw new Error("Gemini analyze returned an empty response.");
  }

  const parsed = RepoAnalyzeResponse.parse({
    repoName: metadata.repoName,
    ...JSON.parse(content),
    rawContext,
  });

  return parsed;
}

async function analyzeRepoWithOpenAiProvider(
  provider: Exclude<AiProvider, "gemini">,
  metadata: RepoMetadata,
  rawContext: string,
  files: Array<{ path: string; content: string }>,
): Promise<AnalyzedRepo> {
  const content = await openAiCompatibleGenerateContent(provider, {
    model: getProviderModel(provider),
    messages: [
      {
        role: "system",
        content:
          "You analyze GitHub repositories and return only valid JSON. Infer code personality from README, metadata, and file samples. Keep outputs concrete and useful for people trying to install, run, or debug the repo.",
      },
      {
        role: "user",
        content: [
          `Repository: ${metadata.repoName}`,
          metadata.description ? `GitHub description: ${metadata.description}` : "",
          metadata.language !== "Unknown" ? `Primary language: ${metadata.language}` : "",
          metadata.topics.length ? `Topics: ${metadata.topics.join(", ")}` : "",
          files.length ? `Important files: ${files.map((file) => file.path).join(", ")}` : "",
          "Analyze this repository context and return only a valid JSON object with keys repoDescription, codeDNA, summary, and voiceIntro.",
          rawContext,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    temperature: 0.35,
    response_format: { type: "json_object" },
  });

  if (!content) {
    throw new Error(`${provider} analyze returned an empty response.`);
  }

  return normalizeAnalysisPayload(JSON.parse(extractFirstJsonObject(content)), metadata, rawContext, files);
}

async function analyzeRepoWithFallbackProviders(
  metadata: RepoMetadata,
  rawContext: string,
  files: Array<{ path: string; content: string }>,
): Promise<{ analysis: AnalyzedRepo; providerUsed: AiProvider | "fallback"; providerAttempts: ProviderAttempt[] }> {
  const providers = getAvailableProviders();
  const attempts: ProviderAttempt[] = [];

  for (const provider of providers) {
    try {
      if (provider === "gemini") {
        const analysis = await analyzeRepoWithGemini(metadata, rawContext, files);
        attempts.push({ provider, status: "success" });
        return { analysis, providerUsed: provider, providerAttempts: attempts };
      }
      const analysis = await analyzeRepoWithOpenAiProvider(provider, metadata, rawContext, files);
      attempts.push({ provider, status: "success" });
      return { analysis, providerUsed: provider, providerAttempts: attempts };
    } catch (error) {
      attempts.push({
        provider,
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 200) : "Unknown provider failure.",
      });
    }
  }

  return {
    analysis: buildFallbackAnalysis(metadata, rawContext, files),
    providerUsed: "fallback",
    providerAttempts: attempts,
  };
}

function writeSse(res: { write: (chunk: string) => void }, payload: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function streamChatWithProvider(
  provider: AiProvider,
  body: { repoName: string; message: string; history: Array<{ role: "user" | "assistant"; content: string }> },
  combinedContext: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const styleInstruction = buildChatStyleInstruction();

  if (provider === "gemini") {
    return geminiStreamGenerateContent(
      GEMINI_CHAT_MODEL,
      {
        system_instruction: {
          parts: [
            {
              text: `You are an AI embedded in the ${body.repoName} repo. Detect the user's language from their message and reply ENTIRELY in that same language. You help users install, run, understand, and debug this codebase. When relevant raw files are provided, use them directly and mention the file names you relied on. ${styleInstruction}\n\nRepository context:\n${combinedContext}`,
            },
          ],
        },
        contents: [
          ...body.history.map((entry) => ({
            role: entry.role === "assistant" ? "model" : "user",
            parts: [{ text: entry.content }],
          })),
          {
            role: "user",
            parts: [{ text: body.message }],
          },
        ],
        generationConfig: {
          temperature: 0.5,
        },
      },
      onChunk,
    );
  }

  return openAiCompatibleStreamGenerateContent(
    provider,
    {
      model: getProviderModel(provider),
      messages: [
        {
          role: "system",
          content: `You are an AI embedded in the ${body.repoName} GitHub repository. Detect the language of the user's message and reply entirely in that same language. You help users install, run, understand, and debug this codebase. Use actual file content when available and mention the file names you relied on. ${styleInstruction}\n\nRepository context:\n${combinedContext}`,
        },
        ...body.history.map((entry): OpenAiLikeMessage => ({
          role: entry.role === "assistant" ? "assistant" : "user",
          content: entry.content,
        })),
        {
          role: "user" as const,
          content: body.message,
        },
      ],
      temperature: 0.5,
    },
    onChunk,
  );
}

router.post("/repo/analyze", async (req: any, res: any) => {
  try {
    const body = RepoAnalyzeBody.parse(req.body);
    const repoUrl = normalizeGitHubUrl(body.repoUrl);
    if (!isValidGitHubUrl(repoUrl)) {
      return res.status(400).json({ error: "bad_request", message: "Please provide a valid GitHub repository URL." });
    }

    const metadata = await fetchRepoMetadata(repoUrl);
    const [{ mainPage, readme }, importantFileResult] = await Promise.all([
      scrapeRepoPages(repoUrl, metadata.defaultBranch),
      fetchImportantFileSamples(metadata),
    ]);

    const rawContext = buildRawContext(
      metadata,
      mainPage,
      readme,
      importantFileResult.treeSummary,
      importantFileResult.files,
    );
    const { analysis, providerUsed, providerAttempts } = await analyzeRepoWithFallbackProviders(
      metadata,
      rawContext,
      importantFileResult.files,
    );

    return res.json({
      ...analysis,
      providerUsed,
      providerAttempts,
    });
  } catch (error) {
    req.log?.error?.({ err: error }, "Repo analysis failed");
    const message = error instanceof Error ? error.message : "Repo analysis failed.";
    return res.status(500).json({ error: "repo_analysis_failed", message });
  }
});

router.post("/chat/message", async (req: any, res: any) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const body = ChatMessageBody.parse(req.body);
    const repoContext = truncateText(body.repoContext, MAX_CHAT_CONTEXT);
    const relevantContext = await fetchRelevantFileContext(body.repoName, body.message).catch(() => ({ context: "", loaded: [] as string[] }));
    const combinedContext = [repoContext, relevantContext.context].filter(Boolean).join("\n\n");
    const providerAttempts: ProviderAttempt[] = [];

    let replyText = buildFallbackChatReply(body.repoName, combinedContext, body.message);
    if (relevantContext.loaded.length) {
      writeSse(res, { filesLoaded: relevantContext.loaded });
    }

    let streamed = false;
    let providerUsed: AiProvider | "fallback" = "fallback";
    for (const provider of getAvailableProviders()) {
      try {
        const providerReply = await streamChatWithProvider(
          provider,
          body,
          combinedContext,
          (chunk) => {
            streamed = true;
            writeSse(res, { content: chunk });
          },
        );
        if (providerReply) {
          providerAttempts.push({ provider, status: "success" });
          providerUsed = provider;
          writeSse(res, { providerUsed, providerAttempts });
          replyText = providerReply;
          break;
        }
      } catch (error) {
        providerAttempts.push({
          provider,
          status: "failed",
          error: error instanceof Error ? error.message.slice(0, 200) : "Unknown provider failure.",
        });
        req.log?.warn?.({ err: error, provider }, "Chat provider unavailable, trying next provider");
      }
    }

    if (!streamed || replyText === buildFallbackChatReply(body.repoName, combinedContext, body.message)) {
      providerUsed = "fallback";
      writeSse(res, { providerUsed, providerAttempts });
      for (const chunk of chunkText(replyText)) {
        writeSse(res, { content: chunk });
      }
    }

    writeSse(res, { done: true });
    return res.end();
  } catch (error) {
    req.log?.error?.({ err: error }, "Repo chat failed");
    const message = error instanceof Error ? error.message : "Repo chat failed.";
    writeSse(res, { error: message });
    writeSse(res, { done: true });
    return res.end();
  }
});

router.post("/voice/synthesize", async (req: any, res: any) => {
  try {
    const body = VoiceSynthesizeBody.parse(req.body);

    if (process.env.ELEVENLABS_API_KEY) {
      try {
        const elevenRaw = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "xi-api-key": process.env.ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
              text: body.text,
              model_id: ELEVENLABS_MODEL_ID,
            }),
            signal: AbortSignal.timeout(30000),
          },
        );
        const eleven = elevenRaw as FetchResponseLike;
        if (eleven.ok) {
          return res.json({
            audioBase64: Buffer.from(await eleven.arrayBuffer()).toString("base64"),
            mimeType: "audio/mpeg",
          });
        }
      } catch (error) {
        req.log?.warn?.({ err: error }, "ElevenLabs synthesis failed");
      }
    }
    throw new Error("Voice synthesis is unavailable because ElevenLabs could not generate audio.");
  } catch (error) {
    req.log?.error?.({ err: error }, "Voice synth failed");
    const message = error instanceof Error ? error.message : "Voice synthesis failed.";
    return res.status(500).json({ error: "voice_synthesis_failed", message });
  }
});

router.post("/voice/transcribe", async (req: any, res: any) => {
  try {
    const body = VoiceTranscribeBody.parse(req.body);
    const mimeType = body.mimeType || "audio/webm";
    const audioBase64 = stripDataUrlPrefix(body.audioBase64);

    const data = await geminiGenerateContent(GEMINI_TRANSCRIBE_MODEL, {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Transcribe the speech in this audio. Return only the transcript in the speaker's original language, with no extra commentary.",
            },
            {
              inlineData: {
                mimeType: mimeType,
                data: audioBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
      },
    });

    return res.json({ text: extractGeminiText(data) || "" });
  } catch (error) {
    req.log?.error?.({ err: error }, "Voice transcription failed");
    const message = error instanceof Error ? error.message : "Voice transcription failed.";
    return res.status(500).json({ error: "voice_transcription_failed", message });
  }
});

export default router;
