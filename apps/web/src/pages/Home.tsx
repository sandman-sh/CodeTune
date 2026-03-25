import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, type Variants } from "framer-motion";
import { Music, Code2, Sparkles, Download, Share2, RotateCcw, ExternalLink, Headphones, Film, Guitar, Mic, ChevronRight, Swords } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { AppModeSwitch } from "@/components/AppModeSwitch";
import { AudioPlayer } from "@/components/AudioPlayer";
import { ShareDialog } from "@/components/ShareDialog";
import { CodeDNA, type MusicParamsData, type CodeMetricsData } from "@/components/CodeDNA";
import { SoundtrackCard } from "@/components/SoundtrackCard";
import { useGenerateSoundtrack, GenerateRequestMode, GenerateRequestGenre, GenerateRequestGenerationType } from "@codetune/api-client-react";

const GENRES = [
  { id: GenerateRequestGenre.lofi, label: "Lofi", Icon: Headphones, desc: "Chill & reflective" },
  { id: GenerateRequestGenre.cinematic, label: "Cinematic", Icon: Film, desc: "Epic & dramatic" },
  { id: GenerateRequestGenre.indie, label: "Indie", Icon: Guitar, desc: "Heartfelt & raw" },
  { id: GenerateRequestGenre.rap, label: "Rap", Icon: Mic, desc: "Technical & bold" },
];

const LOADING_STEPS = [
  "Analyzing repo with Firecrawl…",
  "Reading README and source files…",
  "Writing lyrics from your codebase…",
  "Composing music with ElevenLabs…",
  "Rendering audio track…",
  "Finalizing your soundtrack…",
];

const MOCK_LYRICS = `(Verse 1)
I pushed to main at 2 AM
The pipeline failed, I'm trying again
Console dot log is all I see
A thousand lines of pure spaghetti

(Chorus)
Oh, refactor my heart
Tear this monolithic structure apart
We're deploying to prod with a silent prayer
Hoping the servers will still be there

(Verse 2)
Docker containers spinning around
Kubernetes clusters falling down
I forgot the env vars, what a shame
Blame it on the junior, it's a dangerous game

(Outro)
Ship it, ship it, ship it to prod
Hope the load balancer's blessed by God`;

// Stagger container variants
const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0.25, duration: 0.55 } },
};

// Magnetic button hook
function useMagnetic(strength = 0.3) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 25 });
  const sy = useSpring(y, { stiffness: 300, damping: 25 });

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    x.set((e.clientX - cx) * strength);
    y.set((e.clientY - cy) * strength);
  };
  const onLeave = () => { x.set(0); y.set(0); };
  return { sx, sy, onMove, onLeave };
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [mode, setMode] = useState<GenerateRequestMode>(() =>
    (localStorage.getItem("ct-mode") as GenerateRequestMode) || GenerateRequestMode.lyrical
  );
  const [genre, setGenre] = useState<GenerateRequestGenre>(GenerateRequestGenre.lofi);
  const [generationType, setGenerationType] = useState<GenerateRequestGenerationType>(GenerateRequestGenerationType.quick);
  const [loadingStep, setLoadingStep] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [fallback, setFallback] = useState<any>(null);
  const [urlError, setUrlError] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ctaMagnetic = useMagnetic(0.2);

  // Battle mode
  const [battleMode, setBattleMode] = useState(false);
  const [repoUrl2, setRepoUrl2] = useState("");
  const [urlError2, setUrlError2] = useState(false);
  const [inputFocused2, setInputFocused2] = useState(false);
  const [loadingStep2, setLoadingStep2] = useState(0);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { localStorage.setItem("ct-mode", mode); }, [mode]);

  const { mutate: generate, isPending, data, error, reset } = useGenerateSoundtrack();
  const { mutate: generate2, isPending: isPending2, data: data2, error: error2, reset: reset2 } = useGenerateSoundtrack();

  const normalizeGitHubUrl = (input: string): string => {
    let url = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
    if (/^https?:\/\/(www\.)?github\.com\//i.test(url)) return url.replace(/^http:\/\//i, "https://");
    if (/^(www\.)?github\.com\//i.test(url)) return `https://${url.replace(/^www\./i, "")}`;
    if (/^[\w.-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`;
    return url;
  };

  const isValidUrl = (url: string) =>
    /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+/.test(url);

  const handleGenerate = () => {
    if (!repoUrl) return;
    const normalized = normalizeGitHubUrl(repoUrl);
    if (normalized !== repoUrl) setRepoUrl(normalized);
    if (!isValidUrl(normalized)) { setUrlError(true); return; }

    if (battleMode && repoUrl2) {
      const n2 = normalizeGitHubUrl(repoUrl2);
      if (!isValidUrl(n2)) { setUrlError2(true); return; }
      setUrlError2(false);
      setLoadingStep2(0);
      generate2({ data: { repoUrl: n2, mode, genre, generationType } });
    }

    setUrlError(false);
    setLoadingStep(0);
    setFallback(null);
    generate(
      { data: { repoUrl: normalized, mode, genre, generationType } },
      {
        onError: () => {
          setTimeout(() => {
            setFallback({
              id: `track-${Date.now()}`,
              repoUrl,
              repoName: repoUrl.split("/").slice(-2).join("/") || "my-repo",
              mode, genre, generationType,
              lyrics: mode === GenerateRequestMode.lyrical ? MOCK_LYRICS : null,
              audioUrl: null,
              duration: generationType === GenerateRequestGenerationType.quick ? 26 : 80,
              createdAt: new Date().toISOString(),
            });
          }, 3500);
        },
      }
    );
  };

  const handleReset = () => {
    reset(); reset2();
    setFallback(null);
    setRepoUrl(""); setRepoUrl2("");
    setUrlError(false); setUrlError2(false);
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPending || (error && !fallback)) {
      timer = setInterval(() => {
        setLoadingStep((p) => Math.min(p + 1, LOADING_STEPS.length - 1));
      }, 1400);
    }
    return () => clearInterval(timer);
  }, [isPending, error, fallback]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPending2) {
      timer = setInterval(() => {
        setLoadingStep2((p) => Math.min(p + 1, LOADING_STEPS.length - 1));
      }, 1400);
    }
    return () => clearInterval(timer);
  }, [isPending2]);

  const result = fallback || data;
  const result2 = data2;

  const handleDownload = useCallback(async () => {
    if (!result?.audioUrl) return;
    const base = (import.meta.env.BASE_URL as string)?.replace(/\/$/, "") || "";
    const url = result.audioUrl.startsWith("http") ? result.audioUrl : `${base}${result.audioUrl}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(result.repoName as string)?.replace(/\//g, "-") || "codetune"}-soundtrack.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [result]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground overflow-x-hidden">

      {/* ── Nav ── */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="fixed top-0 inset-x-0 z-50 h-14 flex items-center justify-between px-6 border-b border-border bg-background/80 backdrop-blur-xl"
      >
        <Link href="/">
          <a onClick={result || isPending ? handleReset : undefined}>
            <motion.div
              className="flex items-center gap-2.5 cursor-pointer"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <motion.div
                className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center"
                animate={isPending ? { rotate: [0, 360] } : { rotate: 0 }}
                transition={{ duration: 2, repeat: isPending ? Infinity : 0, ease: "linear" }}
              >
                <Music className="w-3.5 h-3.5 text-background" />
              </motion.div>
              <span className="font-semibold text-base tracking-tight">CodeTune</span>
            </motion.div>
          </a>
        </Link>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-4 text-xs text-muted-foreground pr-11"
        >
          <AppModeSwitch />
          <span className="hidden lg:block">Powered by Firecrawl &amp; ElevenLabs</span>
        </motion.div>
      </motion.header>

      <main className="flex-1 pt-28 pb-24 px-4 sm:px-6 max-w-3xl mx-auto w-full">
        <AnimatePresence mode="wait">

          {/* ── HERO ── */}
          {!result && !isPending && !(error && !fallback) && (
            <motion.div
              key="hero"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: -16, transition: { duration: 0.2 } }}
              className="flex flex-col items-center"
            >
              {/* Title */}
              <motion.div variants={itemVariants} className="text-center mb-10">
                <h1 className="text-4xl sm:text-6xl font-bold leading-[1.08] tracking-[-0.04em] mb-4">
                  {"Your code has".split(" ").map((word, i) => (
                    <motion.span
                      key={i}
                      className="inline-block mr-[0.25em]"
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08, type: "spring", bounce: 0.3, duration: 0.6 }}
                    >
                      {word}
                    </motion.span>
                  ))}
                  <br />
                  {"a soundtrack.".split(" ").map((word, i) => (
                    <motion.span
                      key={i}
                      className="inline-block mr-[0.25em]"
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.24 + i * 0.08, type: "spring", bounce: 0.3, duration: 0.6 }}
                    >
                      {word}
                    </motion.span>
                  ))}
                </h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                  className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed"
                >
                  Turn any GitHub repo into its own soundtrack — where your code becomes music.
                </motion.p>
              </motion.div>

              {/* Card */}
              <motion.div variants={itemVariants} className="w-full panel p-6 sm:p-8 space-y-7">

                {/* URL Input */}
                <motion.div variants={itemVariants} className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Repository</label>
                  <motion.div
                    className="relative"
                    animate={inputFocused ? { scale: 1.005 } : { scale: 1 }}
                    transition={{ type: "spring", bounce: 0.3, duration: 0.3 }}
                  >
                    <motion.div
                      animate={inputFocused ? { opacity: 1 } : { opacity: 0.5 }}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    >
                      <Code2 className="w-4 h-4 text-muted-foreground" />
                    </motion.div>
                    <input
                      ref={inputRef}
                      type="url"
                      value={repoUrl}
                      onChange={(e) => { setRepoUrl(e.target.value); setUrlError(false); }}
                      onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => {
                        setInputFocused(false);
                        if (repoUrl) {
                          const n = normalizeGitHubUrl(repoUrl);
                          if (n !== repoUrl) setRepoUrl(n);
                        }
                      }}
                      placeholder="Paste GitHub repo URL…"
                      className={cn(
                        "w-full bg-input border rounded-xl pl-10 pr-4 py-3 text-sm font-mono placeholder:text-muted-foreground/50 outline-none transition-all duration-200",
                        "focus:ring-1 focus:ring-foreground/30 focus:border-foreground/40",
                        urlError ? "border-destructive ring-1 ring-destructive" : "border-border"
                      )}
                    />
                  </motion.div>
                  <AnimatePresence>
                    {urlError && (
                      <motion.p
                        initial={{ opacity: 0, y: -4, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -4, height: 0 }}
                        className="text-xs text-destructive pl-1"
                      >
                        Please enter a valid GitHub repository URL.
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Mode + Length */}
                <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Mode</label>
                    <div className="flex bg-input border border-border p-0.5 rounded-xl relative">
                      {[GenerateRequestMode.lyrical, GenerateRequestMode.instrumental].map((m) => (
                        <button
                          key={m}
                          onClick={() => setMode(m)}
                          className={cn(
                            "flex-1 py-2 text-xs font-medium rounded-lg capitalize relative z-10 transition-colors duration-200",
                            mode === m ? "text-background" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {mode === m && (
                            <motion.div
                              layoutId="mode-pill"
                              className="absolute inset-0 bg-foreground rounded-[10px] -z-10"
                              transition={{ type: "spring", bounce: 0.22, duration: 0.45 }}
                            />
                          )}
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Length</label>
                    <div className="flex bg-input border border-border p-0.5 rounded-xl relative">
                      {[
                        { v: GenerateRequestGenerationType.quick, label: "Quick", sub: "~26s" },
                        { v: GenerateRequestGenerationType.full, label: "Full", sub: "~1:20" },
                      ].map(({ v, label, sub }) => (
                        <button
                          key={v}
                          onClick={() => setGenerationType(v)}
                          className={cn(
                            "flex-1 py-2 text-xs font-medium rounded-lg relative z-10 transition-colors duration-200 flex flex-col items-center",
                            generationType === v ? "text-background" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {generationType === v && (
                            <motion.div
                              layoutId="type-pill"
                              className="absolute inset-0 bg-foreground rounded-[10px] -z-10"
                              transition={{ type: "spring", bounce: 0.22, duration: 0.45 }}
                            />
                          )}
                          <span>{label}</span>
                          <span className="text-[10px] opacity-60">{sub}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>

                {/* Genre */}
                <motion.div variants={itemVariants} className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Genre</label>
                  <div className="grid grid-cols-4 gap-2">
                    {GENRES.map(({ id, label, Icon, desc }, i) => (
                      <motion.button
                        key={id}
                        onClick={() => setGenre(id)}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05, type: "spring", bounce: 0.3 }}
                        whileHover={{ scale: genre === id ? 1 : 1.04, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        className={cn(
                          "flex flex-col items-center justify-center py-4 rounded-xl border text-xs font-medium transition-colors duration-200 gap-2 relative overflow-hidden",
                          genre === id
                            ? "bg-foreground text-background border-foreground"
                            : "bg-input border-border text-muted-foreground hover:border-foreground/20"
                        )}
                      >
                        {genre === id && (
                          <motion.div
                            layoutId="genre-bg"
                            className="absolute inset-0 bg-foreground -z-10 rounded-xl"
                            transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                          />
                        )}
                        <motion.div
                          animate={genre === id ? { rotate: [0, -8, 8, 0], scale: [1, 1.2, 1] } : {}}
                          transition={{ duration: 0.35 }}
                        >
                          <Icon className="w-4 h-4" />
                        </motion.div>
                        <span>{label}</span>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                {/* Battle Mode toggle */}
                <motion.div variants={itemVariants} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Battle Mode</label>
                    <motion.button
                      onClick={() => { setBattleMode((b) => !b); setRepoUrl2(""); setUrlError2(false); }}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      className={cn(
                        "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all",
                        battleMode
                          ? "bg-foreground text-background border-foreground"
                          : "bg-transparent text-muted-foreground border-border hover:border-foreground/30"
                      )}
                    >
                      <Swords className="w-3 h-3" />
                      {battleMode ? "VS On" : "Repo vs Repo"}
                    </motion.button>
                  </div>

                  <AnimatePresence>
                    {battleMode && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-1.5 pt-1">
                          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Challenger repo</p>
                          <motion.div
                            className="relative"
                            animate={inputFocused2 ? { scale: 1.005 } : { scale: 1 }}
                            transition={{ type: "spring", bounce: 0.3, duration: 0.3 }}
                          >
                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                              <Code2 className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <input
                              type="url"
                              value={repoUrl2}
                              onChange={(e) => { setRepoUrl2(e.target.value); setUrlError2(false); }}
                              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                              onFocus={() => setInputFocused2(true)}
                              onBlur={() => {
                                setInputFocused2(false);
                                if (repoUrl2) {
                                  const n = normalizeGitHubUrl(repoUrl2);
                                  if (n !== repoUrl2) setRepoUrl2(n);
                                }
                              }}
                              placeholder="Second GitHub repo URL…"
                              className={cn(
                                "w-full bg-input border rounded-xl pl-10 pr-4 py-3 text-sm font-mono placeholder:text-muted-foreground/50 outline-none transition-all duration-200",
                                "focus:ring-1 focus:ring-foreground/30 focus:border-foreground/40",
                                urlError2 ? "border-destructive ring-1 ring-destructive" : "border-border"
                              )}
                            />
                          </motion.div>
                          {urlError2 && (
                            <p className="text-xs text-destructive pl-1">Please enter a valid GitHub repository URL.</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* CTA */}
                <motion.div variants={itemVariants}>
                  <motion.button
                    onClick={handleGenerate}
                    disabled={!repoUrl}
                    style={{ x: ctaMagnetic.sx, y: ctaMagnetic.sy }}
                    onMouseMove={ctaMagnetic.onMove}
                    onMouseLeave={ctaMagnetic.onLeave}
                    whileHover={repoUrl ? { scale: 1.02 } : {}}
                    whileTap={repoUrl ? { scale: 0.97 } : {}}
                    className={cn(
                      "w-full h-12 rounded-xl text-sm font-semibold flex items-center justify-center gap-2",
                      "bg-foreground text-background",
                      "disabled:opacity-30 disabled:cursor-not-allowed",
                      "relative overflow-hidden"
                    )}
                  >
                    {repoUrl && (
                      <motion.div
                        className="absolute inset-0 bg-white/10"
                        initial={{ x: "-100%" }}
                        animate={{ x: "200%" }}
                        transition={{ repeat: Infinity, duration: 2, ease: "linear", repeatDelay: 1 }}
                        style={{ skewX: -15, width: "40%" }}
                      />
                    )}
                    <motion.div
                      animate={repoUrl ? { rotate: [0, 20, -10, 0] } : {}}
                      transition={{ duration: 0.6, repeat: repoUrl ? Infinity : 0, repeatDelay: 2 }}
                    >
                      <Sparkles className="w-4 h-4" />
                    </motion.div>
                    Generate Soundtrack
                    {repoUrl && <ChevronRight className="w-4 h-4 ml-auto opacity-60" />}
                  </motion.button>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {/* ── LOADING ── */}
          {(isPending || (error && !fallback)) && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="w-full max-w-sm panel p-10 flex flex-col items-center text-center gap-8">
                {/* Animated waveform — larger, more dramatic */}
                <div className="flex items-end gap-[3px] h-16">
                  {Array.from({ length: 28 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="flex-1 bg-foreground rounded-full"
                      animate={{
                        height: ["15%", `${60 + Math.sin(i * 0.6) * 35}%`, "15%"],
                        opacity: [0.4, 1, 0.4],
                      }}
                      transition={{
                        duration: 1.0 + (i % 3) * 0.15,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.055,
                      }}
                    />
                  ))}
                </div>

                {/* Step text */}
                <div className="h-12 flex flex-col items-center justify-center">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={loadingStep}
                      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                      transition={{ duration: 0.25 }}
                      className="text-sm font-medium"
                    >
                      {LOADING_STEPS[loadingStep]}
                    </motion.p>
                  </AnimatePresence>
                  <p className="text-xs text-muted-foreground mt-1">
                    {generationType === GenerateRequestGenerationType.quick ? "~26 seconds" : "~1 minute 20 seconds"}
                  </p>
                </div>

                {/* Progress bar */}
                <div className="w-full space-y-2.5">
                  {LOADING_STEPS.map((step, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex items-center gap-3 text-xs"
                    >
                      <motion.div
                        animate={
                          i < loadingStep
                            ? { scale: 1, backgroundColor: "hsl(var(--foreground))" }
                            : i === loadingStep
                            ? { scale: [1, 1.4, 1], backgroundColor: "hsl(var(--foreground))" }
                            : { scale: 1, backgroundColor: "hsl(var(--border))" }
                        }
                        transition={i === loadingStep ? { duration: 0.8, repeat: Infinity } : {}}
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      />
                      <motion.span
                        animate={{ opacity: i <= loadingStep ? 1 : 0.25 }}
                        transition={{ duration: 0.3 }}
                        className="text-left"
                      >
                        {step}
                      </motion.span>
                      {i < loadingStep && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="ml-auto text-foreground/50 text-[10px]"
                        >
                          done
                        </motion.span>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── RESULT ── */}
          {result && (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-5"
            >
              {/* Top bar */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="flex items-center justify-between"
              >
                <motion.button
                  onClick={handleReset}
                  whileHover={{ x: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> New track
                </motion.button>
                <div className="flex gap-2">
                  <motion.button
                    onClick={handleDownload}
                    disabled={!result?.audioUrl}
                    whileHover={result?.audioUrl ? { scale: 1.04 } : {}}
                    whileTap={result?.audioUrl ? { scale: 0.96 } : {}}
                    className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </motion.button>
                  <motion.button
                    onClick={() => setShareOpen(true)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    className="h-8 px-3 rounded-lg bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </motion.button>
                </div>
              </motion.div>

              {/* Content grid */}
              <div className={cn(
                "grid gap-4",
                result.mode !== GenerateRequestMode.instrumental ? "grid-cols-1 lg:grid-cols-5" : "grid-cols-1"
              )}>

                {/* Lyrics panel */}
                {result.mode !== GenerateRequestMode.instrumental && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1, type: "spring", bounce: 0.2 }}
                    className="panel p-6 lg:col-span-2 flex flex-col min-h-72 max-h-[500px]"
                  >
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-4">Lyrics</p>
                    <div className="flex-1 overflow-y-auto pr-1 space-y-0">
                      {(result.lyrics || (result.mode === GenerateRequestMode.lyrical ? "Generating lyrics…" : "Instrumental track.")).split("\n").map((line: string, i: number) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.15 + i * 0.018, duration: 0.3 }}
                        >
                          <span className={cn(
                            "text-sm leading-7 block",
                            line.startsWith("[") ? "text-muted-foreground font-medium mt-3 mb-0.5 text-xs uppercase tracking-widest" : "text-foreground/90"
                          )}>
                            {line || "\u00A0"}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Player panel */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15, type: "spring", bounce: 0.2 }}
                  className={cn(
                    "panel p-6",
                    result.mode !== GenerateRequestMode.instrumental ? "lg:col-span-3" : ""
                  )}
                >
                  <AudioPlayer
                    audioUrl={result.audioUrl}
                    repoName={result.repoName || repoUrl.split("/").pop() || "Repository"}
                    duration={result.duration}
                    genre={result.genre}
                    mode={result.mode}
                    lyrics={result.lyrics}
                    audioErrorMessage={result.audioError}
                  />
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="mt-6 pt-5 border-t border-border flex items-center justify-between text-xs text-muted-foreground"
                  >
                    <span className="flex flex-col leading-tight">
                      <span>{new Date(result.createdAt || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      <span className="text-muted-foreground/60">{new Date(result.createdAt || Date.now()).toLocaleDateString("en-US", { year: "numeric" })}</span>
                    </span>
                    <motion.a
                      href={result.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      whileHover={{ x: 2 }}
                      className="hover:text-foreground flex items-center gap-1 transition-colors"
                    >
                      View repo <ExternalLink className="w-3 h-3" />
                    </motion.a>
                  </motion.div>
                </motion.div>
              </div>

              {/* ── Code DNA + Soundtrack Card ── */}
              {result.musicParams && result.codeMetrics && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
                  <CodeDNA
                    musicParams={result.musicParams as unknown as MusicParamsData}
                    codeMetrics={result.codeMetrics as unknown as CodeMetricsData}
                  />
                  <SoundtrackCard
                    repoName={result.repoName || repoUrl.split("/").slice(-2).join("/") || "repo"}
                    genre={result.genre || "lofi"}
                    mode={result.mode || "instrumental"}
                    musicParams={result.musicParams as unknown as MusicParamsData}
                    codeMetrics={result.codeMetrics as unknown as CodeMetricsData}
                  />
                </div>
              )}

              {/* ── Battle Mode: Second Result ── */}
              {battleMode && (isPending2 || result2) && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, type: "spring", bounce: 0.2 }}
                  className="mt-2"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-border" />
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      <Swords className="w-3.5 h-3.5" />
                      VS
                    </div>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  {isPending2 && !result2 ? (
                    <motion.div
                      className="panel p-8 flex flex-col items-center gap-4"
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 1.8, repeat: Infinity }}
                    >
                      <div className="w-8 h-8 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
                      <p className="text-sm text-muted-foreground">{LOADING_STEPS[loadingStep2]}</p>
                    </motion.div>
                  ) : result2 && (
                    <div className="flex flex-col gap-4">
                      <div className={cn(
                        "grid gap-4",
                        result2.mode !== GenerateRequestMode.instrumental ? "grid-cols-1 lg:grid-cols-5" : "grid-cols-1"
                      )}>
                        {result2.mode !== GenerateRequestMode.instrumental && (
                          <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1, type: "spring", bounce: 0.2 }}
                            className="panel p-6 lg:col-span-2 flex flex-col min-h-48 max-h-64"
                          >
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-4">Lyrics</p>
                            <div className="flex-1 overflow-y-auto pr-1">
                              {(result2.lyrics || "").split("\n").map((line: string, i: number) => (
                                <span key={i} className={cn(
                                  "text-sm leading-7 block",
                                  line.startsWith("[") ? "text-muted-foreground font-medium mt-3 mb-0.5 text-xs uppercase tracking-widest" : "text-foreground/90"
                                )}>
                                  {line || "\u00A0"}
                                </span>
                              ))}
                            </div>
                          </motion.div>
                        )}
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.15, type: "spring", bounce: 0.2 }}
                          className={cn("panel p-6", result2.mode !== GenerateRequestMode.instrumental ? "lg:col-span-3" : "")}
                        >
                          <AudioPlayer
                            audioUrl={result2.audioUrl}
                            repoName={result2.repoName || repoUrl2.split("/").pop() || "Repository"}
                            duration={result2.duration}
                            genre={result2.genre}
                            mode={result2.mode}
                            lyrics={result2.lyrics}
                            audioErrorMessage={result2.audioError}
                          />
                        </motion.div>
                      </div>

                      {result2.musicParams && result2.codeMetrics && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <CodeDNA
                            musicParams={result2.musicParams as unknown as MusicParamsData}
                            codeMetrics={result2.codeMetrics as unknown as CodeMetricsData}
                          />
                          <SoundtrackCard
                            repoName={result2.repoName || repoUrl2.split("/").slice(-2).join("/") || "repo"}
                            genre={result2.genre || "lofi"}
                            mode={result2.mode || "instrumental"}
                            musicParams={result2.musicParams as unknown as MusicParamsData}
                            codeMetrics={result2.codeMetrics as unknown as CodeMetricsData}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-center text-xs text-muted-foreground/50 mt-8"
              >
                Powered by Firecrawl · Voice &amp; Audio by ElevenLabs · Made with CodeTune
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile sticky CTA */}
      <AnimatePresence>
        {!result && !isPending && !(error && !fallback) && (
          <motion.div
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={{ type: "spring", bounce: 0.25 }}
            className="sm:hidden fixed bottom-0 inset-x-0 p-4 bg-background/90 backdrop-blur border-t border-border"
          >
            <button
              onClick={handleGenerate}
              disabled={!repoUrl}
              className="w-full h-12 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-30 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Generate Soundtrack
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {result && (
        <ShareDialog
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          soundtrackId={result.id || "mock-id"}
          repoName={result.repoName || repoUrl.split("/").pop() || "Repository"}
          genre={result.genre || genre}
        />
      )}
    </div>
  );
}
