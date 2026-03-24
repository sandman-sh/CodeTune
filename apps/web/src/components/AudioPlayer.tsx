import { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { AudioVisualizer } from "./AudioVisualizer";

function formatTime(s: number) {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface AudioPlayerProps {
  audioUrl?: string | null;
  repoName: string;
  duration?: number | null;
  genre?: string;
  mode?: string;
  lyrics?: string | null;
  audioErrorMessage?: string | null;
}

export function AudioPlayer({ audioUrl, repoName, duration = 80, genre, mode, audioErrorMessage }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 80);
  const [muted, setMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [audioError, setAudioError] = useState(false);

  const isLyrical = mode === "lyrical";

  const resolvedUrl = audioUrl
    ? audioUrl.startsWith("http")
      ? audioUrl
      : audioUrl
    : null;

  // When audio URL changes, reset state and auto-start
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setAudioError(false);
    setHasAudio(!!resolvedUrl);
    setAudioDuration(duration || 80);

    if (!resolvedUrl) return;
    const timer = setTimeout(async () => {
      const audio = audioRef.current;
      if (!audio) return;
      try {
        await audio.play();
      } catch {
        // Autoplay blocked — user can tap play manually
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [resolvedUrl, duration]);

  // Audio element event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => {
      if (isFinite(audio.duration)) setAudioDuration(audio.duration);
    };
    const onEnded = () => {
      setIsPlaying(false);
      if (!isLooping) setCurrentTime(0);
    };
    const onError = () => {
      setAudioError(true);
      setIsPlaying(false);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [isLooping, resolvedUrl]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !resolvedUrl) return;
    if (isPlaying) {
      audio.pause();
    } else {
      try {
        await audio.play();
      } catch {
        setAudioError(true);
      }
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !resolvedUrl) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - r.left) / r.width;
    audio.currentTime = pct * audioDuration;
  };

  const skipBack = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime - 10);
  };

  const skipForward = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(audioDuration, audio.currentTime + 10);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !muted;
    setMuted(!muted);
  };

  const toggleLoop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = !isLooping;
    setIsLooping(!isLooping);
  };

  const pct = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  return (
    <div className="flex flex-col gap-6 h-full justify-between">
      {resolvedUrl && (
        <audio
          ref={audioRef}
          src={resolvedUrl}
          preload="metadata"
          loop={isLooping}
        />
      )}

      {/* Track info */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Now Playing</p>
          <h3 className="text-xl font-bold tracking-tight truncate">{repoName}</h3>
          {genre && (
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
              {genre} · CodeTune Original{isLyrical ? " · Lyrical" : " · Instrumental"}
            </p>
          )}
        </div>
        {/* Record disc */}
        <div
          className={cn(
            "w-14 h-14 rounded-full border border-border bg-card flex items-center justify-center flex-shrink-0 transition-transform",
            isPlaying && "animate-spin"
          )}
          style={{ animationDuration: "6s" }}
        >
          <div className="w-4 h-4 rounded-full bg-border" />
        </div>
      </div>

      {/* Visualizer */}
      <div className="flex-1 flex items-end">
        <AudioVisualizer isPlaying={isPlaying} barCount={40} className="w-full" />
      </div>

      {/* Error state */}
      {audioError && (
        <p className="text-xs text-destructive text-center">
          Audio unavailable — playback failed.
        </p>
      )}

      {/* No audio — credit message */}
      {!resolvedUrl && !audioError && (
        <div className="text-center space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Audio generation unavailable</p>
          <p className="text-xs text-muted-foreground/60">
            {audioErrorMessage || "The server did not return an audio file for this track."}
          </p>
        </div>
      )}

      {/* Progress */}
      <div className="space-y-3">
        <div
          className={cn(
            "relative h-1 bg-border rounded-full group",
            resolvedUrl && !audioError ? "cursor-pointer" : "cursor-default"
          )}
          onClick={resolvedUrl && !audioError ? seek : undefined}
        >
          <div
            className="absolute inset-y-0 left-0 bg-foreground rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
          {resolvedUrl && !audioError && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${pct}% - 5px)` }}
            />
          )}
        </div>

        <div className="flex justify-between text-xs text-muted-foreground font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(audioDuration)}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={toggleLoop}
            className={cn(
              "p-1.5 transition-colors",
              isLooping ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            title="Loop"
          >
            <Repeat className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-5">
            <button
              onClick={skipBack}
              disabled={!resolvedUrl || audioError}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            <button
              onClick={togglePlay}
              disabled={!resolvedUrl || audioError}
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200",
                "bg-foreground text-background hover:scale-105 active:scale-95",
                "disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
              )}
            >
              {isPlaying
                ? <Pause className="w-5 h-5 fill-current" />
                : <Play className="w-5 h-5 fill-current ml-0.5" />
              }
            </button>

            <button
              onClick={skipForward}
              disabled={!resolvedUrl || audioError}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
          </div>

          <button
            onClick={toggleMute}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
