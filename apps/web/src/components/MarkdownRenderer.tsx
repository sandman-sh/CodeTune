import { Fragment, ReactNode } from "react";

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code key={`${part}-${index}`} className="rounded-md bg-background px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}

export function MarkdownRenderer({ content }: { content: string }) {
  const blocks = content.trim().split(/\n{2,}/);

  return (
    <div className="space-y-3 text-sm leading-6 text-foreground">
      {blocks.map((block, blockIndex) => {
        const trimmed = block.trim();

        if (/^```/.test(trimmed)) {
          const code = trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n```$/, "");
          return (
            <pre key={blockIndex} className="overflow-x-auto rounded-2xl border border-border bg-background px-4 py-3 font-mono text-xs text-muted-foreground">
              <code>{code}</code>
            </pre>
          );
        }

        if (/^#{1,6}\s/.test(trimmed)) {
          const heading = trimmed.replace(/^#{1,6}\s*/, "");
          return (
            <h4 key={blockIndex} className="text-sm font-semibold tracking-tight text-foreground">
              {heading}
            </h4>
          );
        }

        if (trimmed.split("\n").every((line) => /^[-*]\s/.test(line.trim()))) {
          return (
            <ul key={blockIndex} className="space-y-2 pl-5 text-sm text-foreground">
              {trimmed.split("\n").map((line, lineIndex) => (
                <li key={lineIndex} className="list-disc">
                  {renderInline(line.replace(/^[-*]\s*/, ""))}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={blockIndex} className="whitespace-pre-wrap text-sm text-foreground">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}
