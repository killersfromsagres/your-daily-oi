"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { StreamSource } from "@/lib/types";

export type PlayerState = "idle" | "loading" | "ready" | "playing" | "paused" | "error";

interface PlayerEngine {
  state: PlayerState;
  error: string | null;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  setMuted: (m: boolean) => void;
  setPlaybackRate: (r: number) => void;
  requestFullscreen: () => void;
  requestPiP: () => void;
}

declare global {
  interface Window {
    Hls?: {
      new (config?: Record<string, unknown>): {
        loadSource: (url: string) => void;
        attachMedia: (el: HTMLVideoElement) => void;
        destroy: () => void;
        on: (event: string, cb: (...args: unknown[]) => void) => void;
      };
      isSupported: () => boolean;
      Events: { ERROR: string; MANIFEST_PARSED: string };
      ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string };
    };
    mpegts?: {
      createPlayer: (config: Record<string, unknown>) => {
        attachMediaElement: (el: HTMLVideoElement) => void;
        load: () => void;
        play: () => Promise<void>;
        pause: () => void;
        unload: () => void;
        destroy: () => void;
      };
      isSupported: () => boolean;
    };
  }
}

async function loadScript(src: string): Promise<void> {
  if (document.querySelector(`script[src="${src}"]`)) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(s);
  });
}

async function ensureHls() {
  if (!window.Hls) {
    await loadScript("https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js");
  }
  return window.Hls;
}

async function ensureMpegts() {
  if (!window.mpegts) {
    await loadScript("https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.min.js");
  }
  return window.mpegts;
}

export function usePlayerEngine(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  stream: StreamSource | null,
  onEnded?: () => void
): PlayerEngine {
  const [state, setState] = useState<PlayerState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);

  const destroyRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) { setState("idle"); return; }

    setState("loading");
    setError(null);

    let cancelled = false;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onDurationChange = () => setDuration(video.duration || 0);
    const onPlaying = () => { if (!cancelled) setState("playing"); setError(null); };
    const onPause = () => { if (!cancelled && !video.ended) setState("paused"); };
    const onEnded_ = () => { if (!cancelled) { setState("paused"); onEnded?.(); } };
    const onCanPlay = () => { if (!cancelled && state !== "playing") setState("ready"); };
    const onVolumeChange = () => { setVolumeState(video.volume); setMutedState(video.muted); };
    const onRateChange = () => setPlaybackRateState(video.playbackRate);
    const onError = () => {
      if (cancelled) return;
      setState("error");
      setError("Não foi possível carregar o vídeo. Verifique sua conexão ou tente outra fonte.");
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded_);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("ratechange", onRateChange);
    video.addEventListener("error", onError);

    const setup = async () => {
      const { url, format } = stream;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

      try {
        if (format === "ts") {
          const mpegts = await ensureMpegts();
          if (mpegts?.isSupported()) {
            const player = mpegts.createPlayer({ type: "mpegts", url, isLive: false, cors: true });
            player.attachMediaElement(video);
            player.load();
            destroyRef.current = () => { player.unload(); player.destroy(); };
          }
        } else if (format === "hls" && !isIOS && video.canPlayType("application/vnd.apple.mpegurl") === "") {
          const Hls = await ensureHls();
          if (Hls?.isSupported()) {
            const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, (_, data: Record<string, unknown>) => {
              if (data["fatal"]) {
                if (!cancelled) { setState("error"); setError("Stream HLS falhou. Tentando fonte alternativa…"); }
              }
            });
            destroyRef.current = () => hls.destroy();
          } else {
            video.src = url;
          }
        } else {
          // HLS nativo (iOS/Safari) ou MP4
          video.src = url;
          video.load();
        }

        if (!cancelled) {
          try { await video.play(); } catch {
            if (!cancelled) setState("ready");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setState("error");
          setError(err instanceof Error ? err.message : "Erro ao inicializar player");
        }
      }
    };

    void setup();

    return () => {
      cancelled = true;
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded_);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("error", onError);
      destroyRef.current?.();
      destroyRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [stream]);

  const play = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setState("playing");
    } catch {
      setError("Reprodução bloqueada pelo navegador. Clique para reproduzir.");
    }
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const seek = useCallback((time: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = time;
  }, []);

  const setVolume = useCallback((vol: number) => {
    const v = videoRef.current;
    if (v) { v.volume = Math.max(0, Math.min(1, vol)); v.muted = false; }
  }, []);

  const setMuted = useCallback((m: boolean) => {
    const v = videoRef.current;
    if (v) v.muted = m;
  }, []);

  const setPlaybackRate = useCallback((r: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = r;
  }, []);

  const requestFullscreen = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const el = v.closest(".ydo-player-container") as HTMLElement | null;
    if (el?.requestFullscreen) el.requestFullscreen();
    else if (v.requestFullscreen) v.requestFullscreen();
  }, []);

  const requestPiP = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) { await document.exitPictureInPicture(); }
    else { await v.requestPictureInPicture(); }
  }, []);

  return { state, error, currentTime, duration, buffered, volume, muted, playbackRate, play, pause, seek, setVolume, setMuted, setPlaybackRate, requestFullscreen, requestPiP };
}
