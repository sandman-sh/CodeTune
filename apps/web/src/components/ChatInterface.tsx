import { FormEvent, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  Bot,
  Bug,
  FileText,
  Languages,
  LayoutDashboard,
  LoaderCircle,
  Mic,
  PlayCircle,
  Send,
  Square,
  TerminalSquare,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ChatMessage } from "@/components/ChatMessage";
import type { RepoChatMessage } from "@/lib/talk-to-repo";
import { cn } from "@/lib/utils";

export interface ChatQuickAction {
  id: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}

interface ChatInterfaceProps {
  repoName: string;
  detectedLanguage: string;
  headerAction?: ReactNode;
  filesLoaded?: string[];
  providerUsed?: string | null;
  messages: RepoChatMessage[];
  isStreaming: boolean;
  isRecording: boolean;
  isPlaying: boolean;
  isSynthesizing: boolean;
  isTranscribing: boolean;
  onSend: (message: string) => Promise<void> | void;
  onListen: (text: string) => Promise<void> | void;
  onStopPlayback: () => void;
  onStartRecording: () => Promise<void> | void;
  onStopRecording: () => Promise<string>;
  quickActions?: ChatQuickAction[];
  onQuickAction?: (actionId: string) => Promise<void> | void;
  error?: string | null;
  className?: string;
}

const DEFAULT_QUICK_ACTIONS: ChatQuickAction[] = [
  { id: "summary", label: "Show summary", Icon: FileText },
  { id: "code-dna", label: "Show code DNA", Icon: LayoutDashboard },
  { id: "repo-details", label: "Show repo details", Icon: TerminalSquare },
  { id: "run", label: "How do I run this?", Icon: PlayCircle },
  { id: "architecture", label: "Explain architecture", Icon: TerminalSquare },
  { id: "debug", label: "Help me debug", Icon: Bug },
];

export function ChatInterface({
  repoName,
  detectedLanguage,
  headerAction,
  filesLoaded = [],
  providerUsed,
  messages,
  isStreaming,
  isRecording,
  isPlaying,
  isSynthesizing,
  isTranscribing,
  onSend,
  onListen,
  onStopPlayback,
  onStartRecording,
  onStopRecording,
  quickActions = DEFAULT_QUICK_ACTIONS,
  onQuickAction,
  error,
  className,
}: ChatInterfaceProps) {
  const [draft, setDraft] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, isStreaming]);

  const canSend = draft.trim().length > 0 && !isStreaming && !isTranscribing;
  const headerLanguage = useMemo(() => detectedLanguage || "Auto", [detectedLanguage]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    const message = draft;
    setDraft("");
    await onSend(message);
  };

  const handleMicClick = async () => {
    if (isRecording) {
      const transcribed = await onStopRecording();
      if (transcribed.trim()) {
        setDraft(transcribed);
        await onSend(transcribed);
        setDraft("");
      }
      return;
    }

    await onStartRecording();
  };

  const handleQuickAction = async (actionId: string, fallbackLabel: string) => {
    if (onQuickAction) {
      await onQuickAction(actionId);
      return;
    }
    await onSend(fallbackLabel);
  };

  return (
    <section
      className={cn(
        "flex h-[clamp(540px,72vh,820px)] flex-col overflow-hidden rounded-2xl border border-border bg-card",
        className,
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center justify-between gap-3 border-b border-border bg-card px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <p className="truncate text-[14px] font-medium text-foreground">{repoName}</p>
          </div>

          <div className="flex items-center gap-2">
            {headerAction ? <div className="flex">{headerAction}</div> : null}
            {providerUsed ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {providerUsed}
              </div>
            ) : null}
            {detectedLanguage !== "Auto" ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <Languages className="h-3 w-3" />
                {headerLanguage}
              </div>
            ) : null}
          </div>
        </div>

        <div ref={messagesRef} className="no-scrollbar flex-1 space-y-4 overflow-y-auto bg-background p-4">
          {filesLoaded.length > 0 ? (
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Context</span>
              {filesLoaded.slice(0, 6).map((entry) => (
                <span
                  key={entry}
                  className="inline-flex max-w-[12rem] items-center rounded-full border border-border bg-card px-2.5 py-1 text-[10px] text-muted-foreground"
                >
                  <span className="truncate">{entry}</span>
                </span>
              ))}
            </div>
          ) : null}

          {quickActions.length > 0 && messages.length > 0 ? (
            <div className="mb-1 flex flex-wrap gap-2">
              {quickActions.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleQuickAction(id, label)}
                  className="inline-flex max-w-[11.5rem] items-center gap-1.5 rounded-2xl border border-border bg-card px-3 py-2 text-left text-[11px] leading-4 text-muted-foreground transition-colors hover:border-foreground/25 hover:bg-muted hover:text-foreground"
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="line-clamp-2 whitespace-normal break-words">{label}</span>
                </button>
              ))}
            </div>
          ) : null}

          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <h3 className="mt-4 text-[14px] font-medium text-foreground">Ask me anything</h3>
              <p className="mt-2 max-w-xs text-[12px] leading-5 text-muted-foreground">
                Ask about setup, architecture, debugging, or how this repo is structured.
              </p>

              <div className="mt-5 grid w-full max-w-xl grid-cols-2 gap-2">
                {quickActions.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleQuickAction(id, label)}
                    className="flex min-h-14 items-start gap-2 rounded-2xl bg-muted px-3 py-3 text-left text-[12px] leading-4 text-foreground transition-colors hover:bg-accent"
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <span className="line-clamp-2 whitespace-normal break-words">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onListen={message.role === "assistant" ? onListen : undefined}
                onStop={message.role === "assistant" ? onStopPlayback : undefined}
                isPlaying={message.role === "assistant" ? isPlaying : false}
                isSynthesizing={message.role === "assistant" ? isSynthesizing : false}
              />
            ))
          )}
        </div>

        <div className="border-t border-border bg-card p-3">
          {error ? <p className="mb-3 text-xs text-destructive">{error}</p> : null}

          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMicClick}
              disabled={isTranscribing}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                isRecording
                  ? "bg-foreground text-background"
                  : "bg-transparent text-foreground hover:bg-muted",
                isTranscribing && "opacity-70",
              )}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
            >
              {isTranscribing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : isRecording ? (
                <Square className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>

            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask this repo anything"
              className="h-9 flex-1 rounded-xl border-0 bg-muted px-3 text-[14px] shadow-none focus-visible:ring-0"
            />

            <button
              type="submit"
              disabled={!canSend}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background transition-opacity disabled:opacity-40"
            >
              {isStreaming ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
