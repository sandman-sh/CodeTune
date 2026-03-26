export interface RepoAnalysis {
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
  providerUsed?: string;
  providerAttempts?: Array<{
    provider: string;
    status: "success" | "failed";
    error?: string;
  }>;
}

export interface RepoChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

export interface VoiceSynthesizeResponse {
  audioBase64: string;
  mimeType: string;
}

export interface VoiceTranscribeResponse {
  text: string;
}

export interface ChatStreamPayload {
  content?: string;
  done?: boolean;
  error?: string;
  filesLoaded?: string[];
  providerUsed?: string;
  providerAttempts?: Array<{
    provider: string;
    status: "success" | "failed";
    error?: string;
  }>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const error = (await response.json()) as { message?: string };
      if (error.message) {
        message = error.message;
      }
    } catch {
      // Ignore JSON parsing errors and keep the generic message.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function analyzeRepo(repoUrl: string): Promise<RepoAnalysis> {
  return postJson<RepoAnalysis>("/api/repo/analyze", { repoUrl });
}

export async function synthesizeVoice(text: string): Promise<VoiceSynthesizeResponse> {
  return postJson<VoiceSynthesizeResponse>("/api/voice/synthesize", { text });
}

export async function transcribeVoice(audioBase64: string, mimeType: string): Promise<VoiceTranscribeResponse> {
  return postJson<VoiceTranscribeResponse>("/api/voice/transcribe", {
    audioBase64,
    mimeType,
  });
}

export function normalizeGitHubUrl(input: string): string {
  let url = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  if (/^https?:\/\/(www\.)?github\.com\//i.test(url)) return url.replace(/^http:\/\//i, "https://");
  if (/^(www\.)?github\.com\//i.test(url)) return `https://${url.replace(/^www\./i, "")}`;
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`;
  return url;
}

export function isGitHubRepoUrl(url: string): boolean {
  return /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+/.test(url);
}

export function detectLanguageLabel(text: string): string {
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  if (/[\u0600-\u06FF]/.test(text)) return "Arabic";
  if (/[\u3040-\u30FF]/.test(text)) return "Japanese";
  if (/[\u4E00-\u9FFF]/.test(text)) return "Chinese";
  if (/[\u0400-\u04FF]/.test(text)) return "Russian";
  if (/[\u00C0-\u024F]/.test(text)) return "Romance";
  return "English";
}

export function toDataUrl(audioBase64: string, mimeType: string): string {
  return `data:${mimeType};base64,${audioBase64}`;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.replace(/^data:[^;]+;base64,/, ""));
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read audio blob."));
    reader.readAsDataURL(blob);
  });
}
