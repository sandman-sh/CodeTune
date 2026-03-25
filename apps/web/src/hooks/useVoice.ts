import { useCallback, useEffect, useRef, useState } from "react";
import { blobToBase64, synthesizeVoice, toDataUrl, transcribeVoice } from "@/lib/talk-to-repo";

export function useVoice() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const cleanupRecording = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      stopPlayback();
      cleanupRecording();
    };
  }, [cleanupRecording, stopPlayback]);

  const playVoice = useCallback(async (text: string) => {
    if (!text.trim()) return;
    stopPlayback();
    setIsSynthesizing(true);

    try {
      const { audioBase64, mimeType } = await synthesizeVoice(text);
      const audio = new Audio(toDataUrl(audioBase64, mimeType));
      audioRef.current = audio;
      audio.addEventListener("ended", () => setIsPlaying(false), { once: true });
      audio.addEventListener("pause", () => setIsPlaying(false), { once: true });
      await audio.play();
      setIsPlaying(true);
    } finally {
      setIsSynthesizing(false);
    }
  }, [stopPlayback]);

  const startRecording = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Voice recording is not supported in this browser.");
    }
    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder is not available in this browser.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    mediaStreamRef.current = stream;
    mediaRecorderRef.current = recorder;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    });

    recorder.start();
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(async (): Promise<string> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return "";

    setIsTranscribing(true);

    try {
      const audioBlob = await new Promise<Blob>((resolve) => {
        recorder.addEventListener(
          "stop",
          () => {
            resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
          },
          { once: true },
        );
        recorder.stop();
      });

      const audioBase64 = await blobToBase64(audioBlob);
      const result = await transcribeVoice(audioBase64, audioBlob.type || recorder.mimeType || "audio/webm");
      return result.text;
    } finally {
      cleanupRecording();
      setIsTranscribing(false);
    }
  }, [cleanupRecording]);

  return {
    isRecording,
    isPlaying,
    isSynthesizing,
    isTranscribing,
    playVoice,
    stopPlayback,
    startRecording,
    stopRecording,
  };
}
