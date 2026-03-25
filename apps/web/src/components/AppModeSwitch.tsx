import { Link, useLocation } from "wouter";
import { MessageSquareText, Music4 } from "lucide-react";
import { cn } from "@/lib/utils";

const MODES = [
  { href: "/music", label: "Code to Music", shortLabel: "Music", Icon: Music4 },
  { href: "/talk", label: "Talk to Repo", shortLabel: "Talk", Icon: MessageSquareText },
];

export function AppModeSwitch() {
  const [location] = useLocation();

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card/80 p-1">
      {MODES.map(({ href, label, shortLabel, Icon }) => {
        const active = location === href;

        return (
          <Link key={href} href={href}>
            <a
              className={cn(
                "inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
            </a>
          </Link>
        );
      })}
    </div>
  );
}
