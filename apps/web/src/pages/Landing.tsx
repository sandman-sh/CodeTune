import { motion } from "framer-motion";
import { Link } from "wouter";
import { MessageSquareText, Music4, Sparkles } from "lucide-react";

const MODES = [
  {
    href: "/music",
    label: "Code to Music",
    description: "Turn a repo into a soundtrack.",
    Icon: Music4,
  },
  {
    href: "/talk",
    label: "Talk to Repo",
    description: "Chat with a repo like an assistant.",
    Icon: MessageSquareText,
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-16 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mx-auto w-full text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Choose a Mode
          </div>
          <h1 className="text-4xl font-bold tracking-[-0.05em] sm:text-5xl">
            Choose how you want to use CodeTune.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
            Start with a simple mode choice, then jump straight in.
          </p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.35 }}
            className="group/modes mx-auto mt-10 flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-center"
          >
            {MODES.map(({ href, label, description, Icon }, index) => (
              <Link key={href} href={href}>
                <a
                  className={`group flex min-h-16 flex-1 items-center gap-3 rounded-[1.4rem] border px-5 py-4 text-left transition-colors ${
                    index === 0
                      ? "border-foreground bg-foreground text-background group-hover/modes:border-border group-hover/modes:bg-card group-hover/modes:text-foreground hover:border-foreground hover:bg-foreground hover:text-background"
                      : "border-border bg-card text-foreground hover:border-foreground hover:bg-foreground hover:text-background"
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${
                      index === 0
                        ? "border-background/20 bg-background/10 group-hover/modes:border-border group-hover/modes:bg-muted/35 group-hover/modes:group-hover:border-border group-hover/modes:group-hover:bg-muted/35 group-hover:border-background/20 group-hover:bg-background/10"
                        : "border-border bg-muted/35 group-hover:border-background/20 group-hover:bg-background/10"
                    }`}
                  >
                    <div className="flex h-full w-full items-center justify-center rounded-2xl">
                      <Icon className="h-4.5 w-4.5 text-current" />
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-current">{label}</p>
                    <p
                      className={`text-xs transition-colors ${
                        index === 0
                          ? "text-background/70 group-hover/modes:text-muted-foreground group-hover:text-background/70"
                          : "text-muted-foreground group-hover:text-background/70"
                      }`}
                    >
                      {description}
                    </p>
                  </div>
                </a>
              </Link>
            ))}
          </motion.div>

          <p className="mt-5 text-xs text-muted-foreground/70">
            You can switch modes later from the header.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
