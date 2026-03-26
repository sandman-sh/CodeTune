import { motion } from "framer-motion";
import { Bot, LoaderCircle, Square, User, Volume2 } from "lucide-react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import type { RepoChatMessage } from "@/lib/talk-to-repo";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: RepoChatMessage;
  onListen?: (text: string) => void;
  onStop?: () => void;
  isPlaying?: boolean;
  isSynthesizing?: boolean;
}

export function ChatMessage({ message, onListen, onStop, isPlaying, isSynthesizing }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("group flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div className={cn("flex max-w-[88%] items-end gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
        <div
          className={cn(
            "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full",
            isUser ? "bg-foreground text-background" : "bg-foreground text-background",
          )}
        >
          {isUser ? (
            <User className="h-3.5 w-3.5" />
          ) : (
            <Bot className="h-3.5 w-3.5" />
          )}
        </div>

        <div className="space-y-1.5">
          <div
            className={cn(
              "border px-[14px] py-[10px] text-[14px] leading-6",
              isUser
                ? "rounded-[16px] rounded-tr-[4px] border-foreground bg-foreground text-background"
                : "rounded-[16px] rounded-tl-[4px] border-border bg-muted text-foreground",
            )}
          >
            {message.pending && !message.content ? (
              <div className="flex items-center gap-1.5 py-1">
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"
                    style={{ animationDelay: `${index * 120}ms` }}
                  />
                ))}
              </div>
            ) : isUser ? (
              <p className="whitespace-pre-wrap text-[14px] leading-6">{message.content}</p>
            ) : (
              <MarkdownRenderer content={message.content} />
            )}
          </div>

          {!isUser && message.content ? (
            <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              <button
                type="button"
                onClick={isPlaying ? onStop : () => onListen?.(message.content)}
                className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {isPlaying ? (
                  <>
                    <Square className="h-3 w-3" />
                    Stop
                  </>
                ) : (
                  <>
                    {isSynthesizing ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Volume2 className="h-3 w-3" />}
                    Listen
                  </>
                )}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
