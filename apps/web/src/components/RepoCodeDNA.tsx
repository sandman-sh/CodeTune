import { motion } from "framer-motion";
import { Layers3, ShieldAlert, Sparkles, Users2, Wrench } from "lucide-react";
import type { RepoAnalysis } from "@/lib/talk-to-repo";

const CARD_ITEMS = [
  { key: "developerType", label: "Developer Type", Icon: Users2 },
  { key: "codeStyle", label: "Code Style", Icon: Sparkles },
  { key: "complexityLevel", label: "Complexity", Icon: Layers3 },
  { key: "riskLevel", label: "Risk Level", Icon: ShieldAlert },
] as const;

export function RepoCodeDNA({ codeDNA }: { codeDNA: RepoAnalysis["codeDNA"] }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Code DNA
        </h2>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {CARD_ITEMS.map(({ key, label, Icon }, index) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + index * 0.06, duration: 0.28 }}
            className="rounded-[14px] border border-border bg-card p-[14px]"
          >
            <div className="mb-1.5 flex items-center gap-2 text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              <span className="text-[10px] font-medium uppercase tracking-[0.22em]">{label}</span>
            </div>
            <p className="text-[14px] font-semibold capitalize text-foreground">
              {String(codeDNA[key]).replace(/([A-Z])/g, " $1").trim()}
            </p>
          </motion.div>
        ))}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38, duration: 0.28 }}
          className="rounded-[14px] border border-border bg-card p-[14px] sm:col-span-2"
        >
          <div className="mb-2.5 flex items-center gap-2 text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" />
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Stack
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {codeDNA.techStack.map((item) => (
              <span
                key={item}
                className="rounded-[8px] bg-muted px-[10px] py-1 text-[12px] font-medium text-foreground"
              >
                {item}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}
