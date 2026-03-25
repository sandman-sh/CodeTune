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

function extractGeminiText(data: unknown): string {
  const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates;
  const parts = candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function chunkText(text: string, size = 32): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks.length ? chunks : [text];
}

function buildFallbackChatReply(repoName: string, repoContext: string, message: string): string {
  const lowerMessage = message.toLowerCase();
  const lines = repoContext.split("\n").map((line) => line.trim()).filter(Boolean);
  const description = lines.find((line) => line.startsWith("Description:"))?.replace(/^Description:\s*/, "");
  const language = lines.find((line) => line.startsWith("Primary language:"))?.replace(/^Primary language:\s*/, "");
  const hasReadme = lines.some((line) => line.toLowerCase().includes("readme markdown"));

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
  const treeData = await fetchGitHubJson<{ tree?: RepoTreeItem[] }>(
    `/repos/${metadata.repoName}/git/trees/${metadata.defaultBranch}?recursive=1`,
  );

  const tree = treeData?.tree || [];
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

function writeSse(res: { write: (chunk: string) => void }, payload: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
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
    const analysis = process.env.GEMINI_API_KEY
      ? await analyzeRepoWithGemini(metadata, rawContext, importantFileResult.files).catch(() =>
          buildFallbackAnalysis(metadata, rawContext, importantFileResult.files),
        )
      : buildFallbackAnalysis(metadata, rawContext, importantFileResult.files);

    return res.json(analysis);
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

    let replyText = buildFallbackChatReply(body.repoName, repoContext, body.message);

    if (process.env.GEMINI_API_KEY) {
      try {
        const geminiReply = extractGeminiText(
          await geminiGenerateContent(GEMINI_CHAT_MODEL, {
            system_instruction: {
              parts: [
                {
                  text: `You are an AI embedded in the ${body.repoName} repo. Detect the user's language from their message and reply ENTIRELY in that same language. You help users install, run, understand, and debug this codebase.\n\nRepository context:\n${repoContext}`,
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
          }),
        );

        if (geminiReply) {
          replyText = geminiReply;
        }
      } catch (error) {
        req.log?.warn?.({ err: error }, "Gemini chat unavailable, using repo-context fallback");
      }
    }

    for (const chunk of chunkText(replyText)) {
      writeSse(res, { content: chunk });
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
