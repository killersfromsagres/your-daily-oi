"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { StreamSource } from "@/lib/types";
import { recordFailedSource } from "@/lib/player-storage";

export type PlayerState = "idle" | "loading" | "ready" | "playing" | "paused" | "error";

export const isRelaySource = (url?: string | null): boolean => {
  return Boolean(url && (url.includes("saimo-tv.pages.dev/api/stream") || url.includes("/api/stream")));
};

export interface UsePlayerEngineOptions {
  expectedRuntimeMin?: number;
  attemptStage?: 0 | 1;
  onFatalError?: (reason: string) => void;
}

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
  onEnded?: () => void,
  options?: UsePlayerEngineOptions
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
    let garbageTimer: ReturnType<typeof setTimeout> | null = null;
    let frozenCheckInterval: ReturnType<typeof setInterval> | null = null;
    let playingSince: number | null = null;

    const isRelay = isRelaySource(stream.url);
    const isStage0 = (options?.attemptStage ?? 0) === 0;

    // Se for relay no stage 0, forçamos HLS (hls.js direto); no stage 1, forçamos nativo (video.src)
    const isHls = isRelay
      ? isStage0
      : stream.format === "hls" ||
        stream.url.includes(".m3u8") ||
        stream.url.includes("/api/hls-proxy") ||
        stream.url.includes("embedplayer2.xyz") ||
        stream.url.includes("dadinhodetapioca.fun") ||
        stream.url.split("?")[0].toLowerCase().endsWith(".txt");

    // Timeout de metadata: 6s para relay HLS probe, 8s para as demais fontes
    const timeoutDuration = isRelay && isHls ? 6000 : 8000;

    let metadataLoaded = false;
    const metadataTimeout = setTimeout(() => {
      if (!metadataLoaded && !cancelled) {
        console.warn(`[PlayerEngine] ${timeoutDuration / 1000}s timeout atingido sem loadedmetadata para: ${stream.url}`);
        setState("error");
        setError(`Tempo limite excedido ao preparar reprodução (${timeoutDuration / 1000}s)`);
      }
    }, timeoutDuration);

    const triggerGarbageDetected = (reason: string) => {
      if (cancelled) return;
      console.warn(`[PlayerEngine] Vídeo lixo/anúncio detectado (${reason}): ${stream.url}`);
      recordFailedSource(stream.url);
      destroyRef.current?.();
      destroyRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      setState("error");
      setError(`Vídeo inválido ou anúncio detectado: ${reason}`);
      options?.onFatalError?.(reason);
    };

    const validateStreamHealth = () => {
      if (cancelled || !video) return false;

      // (b) Tiny banner resolution (ex.: banner de anúncio xbet 300x150)
      if (video.videoWidth > 0 && video.videoWidth <= 320 && video.videoHeight <= 180) {
        triggerGarbageDetected(`Resolução incompatível de anúncio (${video.videoWidth}x${video.videoHeight})`);
        return true;
      }

      // (c) Duração incompatível com duração esperada do filme/série
      const expectedMin = options?.expectedRuntimeMin;
      const d = video.duration;
      if (expectedMin && Number.isFinite(d) && d > 0) {
        const minAcceptableSec = Math.min(expectedMin * 60 * 0.5, 600);
        if (d < minAcceptableSec) {
          triggerGarbageDetected(`Duração de anúncio/curto (${Math.round(d)}s < ${Math.round(minAcceptableSec)}s esperado)`);
          return true;
        }
      }

      return false;
    };

    const onLoadedMetadata = () => {
      metadataLoaded = true;
      clearTimeout(metadataTimeout);
      validateStreamHealth();
    };
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onDurationChange = () => {
      setDuration(video.duration || 0);
      validateStreamHealth();
    };
    const onPlaying = () => {
      metadataLoaded = true;
      clearTimeout(metadataTimeout);
      if (!cancelled) setState("playing");
      setError(null);

      if (!playingSince) {
        playingSince = Date.now();
      }

      if (garbageTimer) clearTimeout(garbageTimer);
      // Validação ~4s após reprodução iniciada
      garbageTimer = setTimeout(() => {
        if (cancelled || !video) return;
        // Se o vídeo já está avançando com sucesso no playback, não dispara alarme falso de duração
        if (video.currentTime > 0.5) {
          validateStreamHealth();
          return;
        }
        // (a) Duração inválida ou zero após playing apenas se não progrediu (Infinity é válido para transmissões EVENT)
        const isDurationInvalid = video.duration === 0 || Number.isNaN(video.duration);
        if (isDurationInvalid && video.currentTime < 0.1) {
          triggerGarbageDetected("Duração ausente ou zero após início de reprodução");
          return;
        }
        validateStreamHealth();
      }, 4000);
    };

    // (d) Tempo congelado: somente conta se o vídeo não estiver pausado
    frozenCheckInterval = setInterval(() => {
      if (cancelled || !video || !playingSince) return;
      if (!video.paused && video.readyState >= 2 && video.currentTime < 0.5) {
        if (Date.now() - playingSince > 12000) {
          triggerGarbageDetected("Vídeo congelado no início (00:00) há mais de 12s");
        }
      }
    }, 1000);

    const onPause = () => { if (!cancelled && !video.ended) setState("paused"); };
    const onEnded_ = () => { if (!cancelled) { setState("paused"); onEnded?.(); } };
    const onCanPlay = () => {
      metadataLoaded = true;
      clearTimeout(metadataTimeout);
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
            hls.on(Hls.Events.ERROR, (_, data: any) => {
              const isFatal = Boolean(data?.fatal);
              const details = String(data?.details || "");
              const type = String(data?.type || "");
              const isManifestOrNetwork =
                details.includes("manifest") ||
                type === "networkError" ||
                details.includes("bufferAppendError");

              if (isFatal || (isRelay && isManifestOrNetwork)) {
                if (!cancelled) {
                  console.warn(`[PlayerEngine] HLS falhou (${details || type}) para: ${url}`);
                  setState("error");
                  setError("Stream HLS falhou. Tentando fonte alternativa…");
                }
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
      if (garbageTimer) clearTimeout(garbageTimer);
      if (frozenCheckInterval) clearInterval(frozenCheckInterval);
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
  }, [stream, options?.attemptStage, options?.expectedRuntimeMin]);

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
