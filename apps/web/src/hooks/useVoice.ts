import { useCallback, useEffect, useRef, useState } from "react";
import { blobToBase64, synthesizeVoice, toDataUrl, transcribeVoice } from "@/lib/talk-to-repo";

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type BrowserWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};

function getSupportedRecordingMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  const browserWindow = window as BrowserWindow;
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition || null;
}

function canUseSpeechSynthesis() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

export function useVoice() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechTranscriptRef = useRef("");
  const speechResultRef = useRef<{
    resolve: (value: string) => void;
    reject: (reason?: unknown) => void;
  } | null>(null);

  const stopPlayback = useCallback(() => {
    if (canUseSpeechSynthesis()) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const cleanupRecording = useCallback(() => {
    speechRecognitionRef.current?.abort();
    speechRecognitionRef.current = null;
    speechTranscriptRef.current = "";
    speechResultRef.current = null;
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
      try {
        const { audioBase64, mimeType } = await synthesizeVoice(text);
        const audio = new Audio(toDataUrl(audioBase64, mimeType));
        audioRef.current = audio;
        audio.addEventListener("ended", () => setIsPlaying(false), { once: true });
        audio.addEventListener("pause", () => setIsPlaying(false), { once: true });
        await audio.play();
        setIsPlaying(true);
        return;
      } catch (voiceError) {
        if (!canUseSpeechSynthesis()) {
          throw voiceError;
        }

        await new Promise<void>((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
          utterance.rate = 1;
          utterance.onend = () => {
            setIsPlaying(false);
            resolve();
          };
          utterance.onerror = () => {
            setIsPlaying(false);
            reject(voiceError);
          };
          setIsPlaying(true);
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        });
      }
    } finally {
      setIsSynthesizing(false);
    }
  }, [stopPlayback]);

  const startRecording = useCallback(async () => {
    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (SpeechRecognitionCtor) {
      const recognition = new SpeechRecognitionCtor();
      speechTranscriptRef.current = "";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0]?.transcript || "")
          .join(" ")
          .trim();
        speechTranscriptRef.current = transcript;
      };
      recognition.onerror = (event) => {
        speechResultRef.current?.reject(new Error(event.error || "Speech recognition failed."));
        speechResultRef.current = null;
      };
      recognition.onend = () => {
        if (!speechResultRef.current) return;
        const transcript = speechTranscriptRef.current.trim();
        if (!transcript) {
          speechResultRef.current.reject(new Error("No speech was detected from the microphone input."));
        } else {
          speechResultRef.current.resolve(transcript);
        }
        speechResultRef.current = null;
      };
      recognition.start();
      speechRecognitionRef.current = recognition;
      setIsRecording(true);
      return;
    }

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Voice recording is not supported in this browser.");
    }
    if (typeof MediaRecorder === "undefined") {
      throw new Error("Voice input is not supported in this browser.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getSupportedRecordingMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    chunksRef.current = [];
    mediaStreamRef.current = stream;
    mediaRecorderRef.current = recorder;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    });

    recorder.start(250);
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(async (): Promise<string> => {
    if (speechRecognitionRef.current) {
      setIsTranscribing(true);
      try {
        const transcript = await new Promise<string>((resolve, reject) => {
          speechResultRef.current = { resolve, reject };
          speechRecognitionRef.current?.stop();
        });
        return transcript;
      } finally {
        cleanupRecording();
        setIsTranscribing(false);
      }
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder) return "";

    setIsTranscribing(true);

    try {
      const audioBlob = await new Promise<Blob>((resolve, reject) => {
        recorder.addEventListener(
          "stop",
          () => {
            if (chunksRef.current.length === 0) {
              reject(new Error("No voice audio was captured. Please try again."));
              return;
            }
            resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
          },
          { once: true },
        );
        if (recorder.state === "recording") {
          try {
            recorder.requestData();
          } catch {
            // Some browsers do not support requestData here.
          }
        }
        recorder.stop();
      });

      const audioBase64 = await blobToBase64(audioBlob);
      if (!audioBase64.trim()) {
        throw new Error("The recorded audio could not be prepared for transcription.");
      }
      const result = await transcribeVoice(audioBase64, audioBlob.type || recorder.mimeType || "audio/webm");
      if (!result.text.trim()) {
        throw new Error("No speech was detected from the microphone input.");
      }
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
