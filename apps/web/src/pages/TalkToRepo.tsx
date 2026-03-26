import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, FileText, Github, LayoutDashboard, ListTree, Music } from "lucide-react";
import { Link } from "wouter";
import { ChatInterface } from "@/components/ChatInterface";
import { RepoInput } from "@/components/RepoInput";
import { toast } from "@/hooks/use-toast";
import { useChat } from "@/hooks/useChat";
import { useVoice } from "@/hooks/useVoice";
import { analyzeRepo, isGitHubRepoUrl, normalizeGitHubUrl, type RepoAnalysis } from "@/lib/talk-to-repo";

function formatSummaryMessage(analysis: RepoAnalysis) {
  return [
    `## Summary`,
    "",
    `**What it does**`,
    analysis.summary.whatItDoes,
    "",
    `**Who it's for**`,
    analysis.summary.whoItsFor,
    "",
    `**How to run**`,
    "```bash",
    analysis.summary.howToRun || "Check the repository README for setup instructions.",
    "```",
    "",
    `**Key files**`,
    analysis.summary.keyFiles.length
      ? analysis.summary.keyFiles.map((file) => `- \`${file}\``).join("\n")
      : "- No key files were identified from the current repo snapshot.",
  ].join("\n");
}

function formatCodeDnaMessage(analysis: RepoAnalysis) {
  return [
    `## Code DNA`,
    "",
    `- **Developer type:** ${analysis.codeDNA.developerType}`,
    `- **Code style:** ${analysis.codeDNA.codeStyle}`,
    `- **Complexity:** ${analysis.codeDNA.complexityLevel}`,
    `- **Risk level:** ${analysis.codeDNA.riskLevel}`,
    `- **Tech stack:** ${
      analysis.codeDNA.techStack.length ? analysis.codeDNA.techStack.map((item) => `\`${item}\``).join(", ") : "Not enough signal yet."
    }`,
  ].join("\n");
}

function formatRepoDetailsMessage(analysis: RepoAnalysis) {
  return [
    `## Repo Details`,
    "",
    `**Repository**`,
    `\`${analysis.repoName}\``,
    "",
    `**Description**`,
    analysis.repoDescription,
    "",
    `**Repo intro**`,
    analysis.voiceIntro,
  ].join("\n");
}

export default function TalkToRepo() {
  const [repoUrl, setRepoUrl] = useState("");
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voiceIntroKeyRef = useRef<string>("");
  const voiceIntroPendingKeyRef = useRef<string>("");
  const lastSpokenMessageIdRef = useRef<string>("");
  const lastSpokenPendingMessageIdRef = useRef<string>("");

  const {
    isRecording,
    isPlaying,
    isSynthesizing,
    isTranscribing,
    playVoice,
    stopPlayback,
    startRecording,
    stopRecording,
  } = useVoice();

  const { messages, isStreaming, detectedLanguage, filesLoaded, providerUsed, sendMessage, pushLocalExchange, reset, error: chatError } = useChat({
    repoName: analysis?.repoName || "",
    repoContext: analysis?.rawContext || "",
  });

  const quickActions = [
    { id: "summary", label: "Show summary", Icon: FileText },
    { id: "code-dna", label: "Show code DNA", Icon: LayoutDashboard },
    { id: "repo-details", label: "Show repo details", Icon: ListTree },
    { id: "run", label: "How do I run this?", Icon: Github },
    { id: "architecture", label: "Explain architecture", Icon: LayoutDashboard },
    { id: "debug", label: "Help me debug", Icon: Bot },
  ];

  useEffect(() => {
    if (!analysis?.voiceIntro) return;
    if (voiceIntroKeyRef.current === analysis.repoName) return;
    if (voiceIntroPendingKeyRef.current === analysis.repoName) return;

    voiceIntroPendingKeyRef.current = analysis.repoName;
    const timer = window.setTimeout(() => {
      playVoice(analysis.voiceIntro)
        .then(() => {
          if (voiceIntroPendingKeyRef.current === analysis.repoName) {
            voiceIntroPendingKeyRef.current = "";
          }
          voiceIntroKeyRef.current = analysis.repoName;
        })
        .catch(() => {
          if (voiceIntroPendingKeyRef.current === analysis.repoName) {
            voiceIntroPendingKeyRef.current = "";
          }
          toast({
            title: "Voice intro unavailable",
            description: "The repo summary loaded, but voice playback could not start.",
          });
        });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [analysis, playVoice]);

  useEffect(() => {
    if (isStreaming) return;

    const latestAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && !message.pending && message.content.trim().length > 0);

    if (!latestAssistantMessage) return;
    if (lastSpokenMessageIdRef.current === latestAssistantMessage.id) return;
    if (lastSpokenPendingMessageIdRef.current === latestAssistantMessage.id) return;

    lastSpokenPendingMessageIdRef.current = latestAssistantMessage.id;
    const timer = window.setTimeout(() => {
      playVoice(latestAssistantMessage.content)
        .then(() => {
          if (lastSpokenPendingMessageIdRef.current === latestAssistantMessage.id) {
            lastSpokenPendingMessageIdRef.current = "";
          }
          lastSpokenMessageIdRef.current = latestAssistantMessage.id;
        })
        .catch(() => {
          if (lastSpokenPendingMessageIdRef.current === latestAssistantMessage.id) {
            lastSpokenPendingMessageIdRef.current = "";
          }
          toast({
            title: "Voice playback unavailable",
            description: "The latest repo reply was shown in text, but voice playback could not start.",
          });
        });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [isStreaming, messages, playVoice]);

  const handleAnalyze = async () => {
    const normalized = normalizeGitHubUrl(repoUrl);
    setRepoUrl(normalized);

    if (!isGitHubRepoUrl(normalized)) {
      setError("Paste a valid GitHub repository URL to analyze this repo.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    stopPlayback();

    try {
      const nextAnalysis = await analyzeRepo(normalized);
      setAnalysis(nextAnalysis);
      lastSpokenMessageIdRef.current = "";
      lastSpokenPendingMessageIdRef.current = "";
      voiceIntroKeyRef.current = "";
      voiceIntroPendingKeyRef.current = "";
      reset();
    } catch (analyzeError) {
      const message = analyzeError instanceof Error ? analyzeError.message : "Repo analysis failed.";
      setError(message);
      toast({
        title: "Analysis failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleQuickAction = async (actionId: string) => {
    if (!analysis) return;

    if (actionId === "summary") {
      pushLocalExchange("Show summary", formatSummaryMessage(analysis));
      return;
    }

    if (actionId === "code-dna") {
      pushLocalExchange("Show code DNA", formatCodeDnaMessage(analysis));
      return;
    }

    if (actionId === "repo-details") {
      pushLocalExchange("Show repo details", formatRepoDetailsMessage(analysis));
      return;
    }

    if (actionId === "run") {
      await sendMessage("How do I run this?");
      return;
    }

    if (actionId === "architecture") {
      await sendMessage("Explain the architecture of this repository.");
      return;
    }

    if (actionId === "debug") {
      await sendMessage("Help me debug this repo. What should I check first?");
    }
  };

  const musicHref = repoUrl ? `/music?repoUrl=${encodeURIComponent(normalizeGitHubUrl(repoUrl))}` : "/music";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="fixed inset-x-0 top-0 z-50 h-14 border-b border-border/60 bg-background/80 backdrop-blur-xl"
      >
        <div className="mx-auto flex h-14 max-w-[1024px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/">
            <a className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground">
                <Music className="h-3.5 w-3.5 text-background" />
              </div>
              <span className="text-[15px] font-semibold tracking-tight">CodeTune</span>
            </a>
          </Link>
          <div className="w-9" />
        </div>
      </motion.header>

      <main className="mx-auto flex w-full max-w-[1024px] flex-col px-4 pb-24 pt-28 sm:px-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0, scale: analysis ? 0.95 : 1 }}
          transition={{ duration: 0.35 }}
          className="mb-8 text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
            Talk to Repo
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-[-0.05em] sm:text-5xl">
            Your GitHub repo, now a voice-powered AI guide
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            Analyze the codebase, hear the repo introduce itself, and ask follow-up questions about setup,
            architecture, or debugging in text and voice.
          </p>
        </motion.section>

        <RepoInput
          value={repoUrl}
          onChange={setRepoUrl}
          onAnalyze={handleAnalyze}
          disabled={isAnalyzing}
          error={error}
        />

        {analysis ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mt-8"
          >
            <ChatInterface
              repoName={analysis.repoName}
              detectedLanguage={detectedLanguage}
              headerAction={
                <Link href={musicHref}>
                  <a className="inline-flex items-center gap-2 rounded-xl border border-foreground bg-foreground px-2.5 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90 sm:px-3">
                    <Music className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Turn This Repo Into Music</span>
                  </a>
                </Link>
              }
              filesLoaded={filesLoaded}
              providerUsed={providerUsed}
              messages={messages}
              isStreaming={isStreaming}
              isRecording={isRecording}
              isPlaying={isPlaying}
              isSynthesizing={isSynthesizing}
              isTranscribing={isTranscribing}
              onSend={sendMessage}
              onListen={playVoice}
              onStopPlayback={stopPlayback}
              onStartRecording={async () => {
                try {
                  await startRecording();
                } catch (recordError) {
                  toast({
                    title: "Mic unavailable",
                    description:
                      recordError instanceof Error ? recordError.message : "Voice capture is not available in this browser.",
                    variant: "destructive",
                  });
                }
              }}
              onStopRecording={async () => {
                try {
                  return await stopRecording();
                } catch (recordError) {
                  toast({
                    title: "Voice input unavailable",
                    description:
                      recordError instanceof Error ? recordError.message : "We could not transcribe your microphone input.",
                    variant: "destructive",
                  });
                  return "";
                }
              }}
              quickActions={quickActions}
              onQuickAction={handleQuickAction}
              error={chatError}
            />
          </motion.div>
        ) : isAnalyzing ? (
          <div className="mt-8">
            <div className="panel h-[clamp(540px,72vh,820px)] animate-pulse bg-card/70" />
          </div>
        ) : null}
      </main>
    </div>
  );
}
