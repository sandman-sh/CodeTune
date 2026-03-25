import { LoaderCircle, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface RepoInputProps {
  value: string;
  onChange: (value: string) => void;
  onAnalyze: () => void;
  disabled?: boolean;
  error?: string | null;
}

export function RepoInput({ value, onChange, onAnalyze, disabled, error }: RepoInputProps) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="panel p-2 sm:p-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div
            className={cn(
              "flex flex-1 items-center gap-3 rounded-2xl border border-border bg-muted/30 px-4 py-3 transition-colors",
              error && "border-destructive/60",
            )}
          >
            <Github className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <Input
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !disabled) {
                  event.preventDefault();
                  onAnalyze();
                }
              }}
              placeholder="Paste any GitHub repo URL"
              disabled={disabled}
              className="h-auto border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0 cursor-text"
            />
          </div>

          <Button type="button" onClick={onAnalyze} disabled={disabled} className="min-w-32 rounded-2xl">
            {disabled ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {disabled ? "Analyzing" : "Analyze"}
          </Button>
        </div>
      </div>

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
