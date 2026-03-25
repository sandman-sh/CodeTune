import { motion } from "framer-motion";
import { FileCode2, FolderTree, PlayCircle, Users } from "lucide-react";
import type { RepoAnalysis } from "@/lib/talk-to-repo";

export function QuickSummary({ summary }: { summary: RepoAnalysis["summary"] }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.35 }}
      className="rounded-[20px] border border-border bg-card px-5 py-5 sm:px-6"
    >
      <h2 className="mb-5 text-[14px] font-semibold text-foreground">Summary</h2>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileCode2 className="h-3.5 w-3.5" />
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">What it does</p>
          </div>
          <p className="text-[14px] leading-6 text-foreground">{summary.whatItDoes}</p>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Who it&apos;s for</p>
          </div>
          <p className="text-[14px] leading-6 text-foreground">{summary.whoItsFor}</p>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <PlayCircle className="h-3.5 w-3.5" />
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">How to run</p>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-[14px] border border-border bg-muted px-4 py-3 font-mono text-[12px] leading-6 text-muted-foreground">
            {summary.howToRun}
          </pre>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FolderTree className="h-3.5 w-3.5" />
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Key files</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.keyFiles.map((file) => (
              <span
                key={file}
                className="rounded-[8px] bg-muted px-[10px] py-1 font-mono text-[12px] text-foreground"
              >
                {file}
              </span>
            ))}
          </div>
        </section>
      </div>
    </motion.section>
  );
}
