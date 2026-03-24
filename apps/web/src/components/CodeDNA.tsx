import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface MusicParamsData {
  bpm: number;
  energy: string;
  mood: string;
  timbre: string;
  scale: string;
  rhythmStyle: string;
  harmonyStyle: string;
  density: string;
  signature: string;
}

export interface CodeMetricsData {
  functionCount: number;
  classCount: number;
  loopCount: number;
  asyncCount: number;
  errorHandlingCount: number;
  totalLines: number;
  nestingDepth: number;
  stars: number;
  forks: number;
  primaryLanguage: string;
  sizeKb: number;
}

interface InsightRow {
  codeLabel: string;
  codeValue: string;
  musicLabel: string;
  musicValue: string;
  icon: string;
}

function buildInsights(metrics: CodeMetricsData, params: MusicParamsData): InsightRow[] {
  const insights: InsightRow[] = [];

  // BPM from functions
  insights.push({
    codeLabel: "Functions",
    codeValue: metrics.functionCount.toLocaleString(),
    musicLabel: "Tempo",
    musicValue: `${params.bpm} BPM`,
    icon: "⚡",
  });

  // Scale from stars
  const starLabel =
    metrics.stars >= 50000 ? `${(metrics.stars / 1000).toFixed(0)}k stars` :
    metrics.stars >= 1000  ? `${(metrics.stars / 1000).toFixed(1)}k stars` :
                             `${metrics.stars} stars`;
  insights.push({
    codeLabel: "GitHub Stars",
    codeValue: starLabel,
    musicLabel: "Musical Key",
    musicValue: params.scale,
    icon: "⭐",
  });

  // Timbre from language
  insights.push({
    codeLabel: "Language",
    codeValue: metrics.primaryLanguage || "Unknown",
    musicLabel: "Instruments",
    musicValue: params.timbre.split(",")[0].trim(),
    icon: "🎸",
  });

  // Energy from nesting depth
  insights.push({
    codeLabel: "Complexity",
    codeValue: `${metrics.nestingDepth} depth · ${metrics.loopCount} loops`,
    musicLabel: "Energy",
    musicValue: params.energy,
    icon: "🔥",
  });

  // Rhythm from async count
  insights.push({
    codeLabel: "Async Patterns",
    codeValue: `${metrics.asyncCount} found`,
    musicLabel: "Rhythm",
    musicValue: params.rhythmStyle,
    icon: "🎵",
  });

  // Density from LOC
  const locLabel = metrics.totalLines >= 1000
    ? `${(metrics.totalLines / 1000).toFixed(1)}k lines`
    : `${metrics.totalLines} lines`;
  insights.push({
    codeLabel: "Lines of Code",
    codeValue: locLabel,
    musicLabel: "Density",
    musicValue: params.density,
    icon: "📊",
  });

  return insights;
}

interface CodeDNAProps {
  musicParams: MusicParamsData;
  codeMetrics: CodeMetricsData;
  className?: string;
}

export function CodeDNA({ musicParams, codeMetrics, className }: CodeDNAProps) {
  const insights = buildInsights(codeMetrics, musicParams);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
      className={cn("panel p-6", className)}
    >
      <div className="flex items-center gap-2 mb-5">
        <div className="w-1.5 h-4 bg-foreground rounded-full" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Code DNA
        </h3>
      </div>

      <div className="space-y-3">
        {insights.map((row, i) => (
          <motion.div
            key={row.codeLabel}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 + i * 0.06, duration: 0.3 }}
            className="flex items-center gap-3"
          >
            {/* Code side */}
            <div className="flex-1 min-w-0 bg-muted/40 rounded-xl px-3 py-2.5 border border-border/50">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-none mb-1">
                {row.codeLabel}
              </p>
              <p className="text-sm font-semibold text-foreground truncate">
                {row.codeValue}
              </p>
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
              <span className="text-base">{row.icon}</span>
              <svg className="w-5 h-3 text-muted-foreground/60" viewBox="0 0 20 12" fill="none">
                <path d="M0 6h16M12 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Music side */}
            <div className="flex-1 min-w-0 bg-foreground/5 rounded-xl px-3 py-2.5 border border-foreground/10">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-none mb-1">
                {row.musicLabel}
              </p>
              <p className="text-sm font-semibold text-foreground truncate">
                {row.musicValue}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="text-[10px] text-muted-foreground/50 mt-4 text-center"
      >
        Each musical element is deterministically derived from your code structure
      </motion.p>
    </motion.div>
  );
}
