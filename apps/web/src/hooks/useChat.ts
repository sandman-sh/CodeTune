import { useCallback, useEffect, useRef, useState } from "react";
import { ChatStreamPayload, RepoChatMessage, detectLanguageLabel } from "@/lib/talk-to-repo";

interface UseChatOptions {
  repoName: string;
  repoContext: string;
}

function createMessage(role: RepoChatMessage["role"], content = "", pending = false): RepoChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    pending,
  };
}

export function useChat({ repoName, repoContext }: UseChatOptions) {
  const [messages, setMessages] = useState<RepoChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState("Auto");
  const [error, setError] = useState<string | null>(null);
  const [filesLoaded, setFilesLoaded] = useState<string[]>([]);
  const [providerUsed, setProviderUsed] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setIsStreaming(false);
    setDetectedLanguage("Auto");
    setError(null);
    setFilesLoaded([]);
    setProviderUsed(null);
  }, []);

  const pushLocalExchange = useCallback((userContent: string, assistantContent: string) => {
    const userMessage = createMessage("user", userContent, false);
    const assistantMessage = createMessage("assistant", assistantContent, false);
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setError(null);
    setDetectedLanguage(detectLanguageLabel(assistantContent));
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || !repoName || !repoContext || isStreaming) return;

    const userMessage = createMessage("user", trimmed, false);
    const assistantMessage = createMessage("assistant", "", true);
    const nextHistory = [...messages, userMessage];
    setMessages([...nextHistory, assistantMessage]);
    setError(null);
    setFilesLoaded([]);
    setProviderUsed(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          repoName,
          repoContext,
          history: nextHistory.map(({ role, content }) => ({ role, content })),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let messageText = "Chat stream could not be started.";
        try {
          const body = await response.json() as { message?: string; error?: string };
          messageText = body.message || body.error || messageText;
        } catch {
          try {
            const text = await response.text();
            if (text.trim()) {
              messageText = text.trim();
            }
          } catch {
            // Keep the generic fallback message.
          }
        }
        throw new Error(messageText);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n");
        while (boundary !== -1) {
          const line = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 1);

          if (line.startsWith("data:")) {
            const payload = JSON.parse(line.slice(5).trim()) as ChatStreamPayload;
            if (payload.error) {
              throw new Error(payload.error);
            }
            if (payload.filesLoaded?.length) {
              setFilesLoaded(payload.filesLoaded);
            }
            if (payload.providerUsed) {
              setProviderUsed(payload.providerUsed);
            }
            if (payload.content) {
              assistantText += payload.content;
              if (detectedLanguage === "Auto" && assistantText.trim().length >= 8) {
                setDetectedLanguage(detectLanguageLabel(assistantText));
              }
              setMessages((current) =>
                current.map((entry) =>
                  entry.id === assistantMessage.id
                    ? { ...entry, content: assistantText, pending: false }
                    : entry,
                ),
              );
            }
            if (payload.done) {
              setMessages((current) =>
                current.map((entry) =>
                  entry.id === assistantMessage.id ? { ...entry, pending: false } : entry,
                ),
              );
              setIsStreaming(false);
              abortRef.current = null;
              return;
            }
          }

          boundary = buffer.indexOf("\n");
        }
      }
    } catch (streamError) {
      if ((streamError as Error).name === "AbortError") {
        return;
      }
      const messageText = streamError instanceof Error ? streamError.message : "Chat failed.";
      setError(messageText);
      setMessages((current) =>
        current.map((entry) =>
          entry.id === assistantMessage.id
            ? {
                ...entry,
                content: entry.content || "I hit a snag while reading the repo context. Try again in a moment.",
                pending: false,
              }
            : entry,
        ),
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [detectedLanguage, isStreaming, messages, repoContext, repoName]);

  return {
    messages,
    isStreaming,
    detectedLanguage,
    error,
    filesLoaded,
    providerUsed,
    sendMessage,
    pushLocalExchange,
    reset,
  };
}
