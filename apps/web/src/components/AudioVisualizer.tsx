import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AudioVisualizerProps {
  isPlaying: boolean;
  barCount?: number;
  className?: string;
}

function generateHeights(barCount: number, t: number): number[] {
  return Array.from({ length: barCount }, (_, i) => {
    const norm = i / barCount;
    // Bell-curve envelope so edges are quieter
    const envelope = Math.exp(-Math.pow(norm - 0.5, 2) / 0.12) * 0.85 + 0.15;
    // Multiple sine waves for organic movement
    const wave =
      Math.sin(t * 2.8 + i * 0.55) * 0.35 +
      Math.sin(t * 1.9 + i * 0.9 + 1.2) * 0.3 +
      Math.sin(t * 4.1 + i * 0.3 + 2.4) * 0.15 +
      Math.sin(t * 0.7 + i * 1.4) * 0.2;
    const raw = (wave + 1) / 2; // 0..1
    return (raw * 0.8 + 0.1) * envelope * 100;
  });
}

export function AudioVisualizer({ isPlaying, barCount = 48, className }: AudioVisualizerProps) {
  const [heights, setHeights] = useState<number[]>(() => Array(barCount).fill(6));
  const rafRef = useRef<number>(0);
  const tRef = useRef(0);
  const prevPlayingRef = useRef(false);

  useEffect(() => {
    if (isPlaying) {
      const animate = () => {
        tRef.current += 0.035;
        setHeights(generateHeights(barCount, tRef.current));
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(rafRef.current);
      // Smoothly settle to flat when paused
      if (prevPlayingRef.current) {
        const settle = () => {
          setHeights((prev) => {
            const next = prev.map((h) => h + (6 - h) * 0.18);
            const done = next.every((h) => Math.abs(h - 6) < 0.5);
            if (!done) rafRef.current = requestAnimationFrame(settle);
            return next;
          });
        };
        rafRef.current = requestAnimationFrame(settle);
      }
    }
    prevPlayingRef.current = isPlaying;
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, barCount]);

  return (
    <div className={cn("flex items-end justify-center gap-px h-16", className)}>
      {heights.map((height, i) => (
        <motion.div
          key={i}
          className="flex-1 bg-foreground/70 rounded-t-sm"
          style={{ height: `${Math.max(height, 6)}%` }}
          animate={{ opacity: isPlaying ? 0.6 + (height / 100) * 0.4 : 0.25 }}
          transition={{ duration: 0.15 }}
        />
      ))}
    </div>
  );
}
