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
  castToTv: () => void;
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

    let metadataLoaded = false;
    const metadataTimeout = setTimeout(() => {
      if (!metadataLoaded && !cancelled) {
        console.warn(`[PlayerEngine] 8s timeout atingido sem loadedmetadata para: ${stream.url}`);
        setState("error");
        setError("Tempo limite excedido ao preparar reprodução (8s)");
      }
    }, 8000);

    const onLoadedMetadata = () => {
      metadataLoaded = true;
      clearTimeout(metadataTimeout);
    };
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onDurationChange = () => setDuration(video.duration || 0);
    const onPlaying = () => {
      metadataLoaded = true;
      clearTimeout(metadataTimeout);
      if (!cancelled) setState("playing");
      setError(null);
    };
    const onPause = () => { if (!cancelled && !video.ended) setState("paused"); };
    const onEnded_ = () => { if (!cancelled) { setState("paused"); onEnded?.(); } };
    const onCanPlay = () => {
      metadataLoaded = true;
      clearTimeout(metadataTimeout);
      // Não exibe estado "ready" se estiver no meio do carregamento inicial ou se o autoplay estiver em curso
      if (!cancelled && video.paused && state !== "playing" && state !== "loading") {
        setState("ready");
      }
    };
    const onVolumeChange = () => { setVolumeState(video.volume); setMutedState(video.muted); };
    const onRateChange = () => setPlaybackRateState(video.playbackRate);
    const onError = () => {
      metadataLoaded = true;
      clearTimeout(metadataTimeout);
      if (cancelled) return;
      setState("error");
      setError("Não foi possível carregar o vídeo. Verifique sua conexão ou tente outra fonte.");
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
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
      const { url } = stream;
      const isHls =
        stream.format === "hls" ||
        url.includes(".m3u8") ||
        url.includes("/api/hls-proxy");
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

      try {
        if (stream.format === "ts") {
          const mpegts = await ensureMpegts();
          if (mpegts?.isSupported()) {
            const player = mpegts.createPlayer({ type: "mpegts", url, isLive: false, cors: true });
            player.attachMediaElement(video);
            player.load();
            destroyRef.current = () => { player.unload(); player.destroy(); };
          }
        } else if (isHls && !isIOS && video.canPlayType("application/vnd.apple.mpegurl") === "") {
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
          try {
            await video.play();
          } catch {
            // Autoplay bloqueado pelo navegador com som: inicia mutado para que o vídeo rode imediatamente
            try {
              video.muted = true;
              await video.play();
            } catch {
              if (!cancelled) setState("ready");
            }
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
      clearTimeout(metadataTimeout);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
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
      setError(null);
    } catch {
      // Se o navegador bloqueou com áudio (política de autoplay), tenta tocar mutado
      try {
        video.muted = true;
        await video.play();
        setState("playing");
        setError(null);
      } catch (err2) {
        setError("Toque na tela para iniciar o vídeo");
      }
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
    const v = videoRef.current as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitExitFullscreen?: () => void;
      webkitDisplayingFullscreen?: boolean;
    }) | null;
    if (!v) return;

    const el = (v.closest(".ydo-player-container") || v) as HTMLElement & {
      webkitRequestFullscreen?: () => void;
      mozRequestFullScreen?: () => void;
      msRequestFullscreen?: () => void;
    };

    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      mozFullScreenElement?: Element;
      msFullscreenElement?: Element;
      webkitExitFullscreen?: () => void;
      mozCancelFullScreen?: () => void;
      msExitFullscreen?: () => void;
    };

    const isFull = !!(
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement ||
      v.webkitDisplayingFullscreen
    );

    if (isFull) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        doc.mozCancelFullScreen();
      } else if (doc.msExitFullscreen) {
        doc.msExitFullscreen();
      } else if (v.webkitExitFullscreen) {
        v.webkitExitFullscreen();
      }
      return;
    }

    // Tenta primeiro container (desktop & Android), com fallback direto para o vídeo (iOS Safari no iPhone)
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {
        if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
      });
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (v.webkitEnterFullscreen) {
      // iPhone / iPad no Safari
      v.webkitEnterFullscreen();
    } else if (v.requestFullscreen) {
      v.requestFullscreen().catch(() => {});
    }
  }, []);

  const requestPiP = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (v.requestPictureInPicture) {
      await v.requestPictureInPicture();
    }
  }, []);

  const castToTv = useCallback(() => {
    const v = videoRef.current as (HTMLVideoElement & {
      webkitShowPlaybackTargetPicker?: () => void;
      remote?: { prompt: () => Promise<void> };
    }) | null;
    if (!v) return;

    // 1. Apple AirPlay (Safari no iPhone, iPad, Mac)
    if (typeof v.webkitShowPlaybackTargetPicker === "function") {
      try {
        v.webkitShowPlaybackTargetPicker();
        return;
      } catch (err) {
        console.warn("AirPlay:", err);
      }
    }

    // 2. Google Cast / Remote Playback API (Android Chrome, Smart TVs, Chromecast)
    if (v.remote && typeof v.remote.prompt === "function") {
      v.remote.prompt().catch((err: unknown) => {
        const error = err as { name?: string };
        if (error?.name !== "AbortError") {
          console.warn("Remote playback prompt:", err);
        }
      });
      return;
    }

    // 3. Presentation API para telas e receptores sem fio
    if ("presentation" in navigator) {
      const pres = (navigator as unknown as { presentation?: { defaultRequest?: { start: () => Promise<void> } } }).presentation;
      if (pres?.defaultRequest) {
        try {
          pres.defaultRequest.start().catch(() => {});
          return;
        } catch {}
      }
    }

    // Feedback amigável para dispositivos sem suporte direto à API
    alert(
      "Espelhar na TV:\n\n• No Android / Chrome: Use o botão 'Transmitir' do seu navegador para enviar para a Smart TV ou Chromecast.\n• No iPhone / iPad: Abra a Central de Controle e ative o 'Espelhamento de Tela' ou AirPlay para a sua TV."
    );
  }, []);

  return {
    state,
    error,
    currentTime,
    duration,
    buffered,
    volume,
    muted,
    playbackRate,
    play,
    pause,
    seek,
    setVolume,
    setMuted,
    setPlaybackRate,
    requestFullscreen,
    requestPiP,
    castToTv,
  };
}
