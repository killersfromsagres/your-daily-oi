"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { StreamSource } from "@/lib/types";
import { recordFailedSource } from "@/lib/player-storage";

export type PlayerState = "idle" | "loading" | "ready" | "playing" | "paused" | "error";

export const isRelaySource = (url?: string | null): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url, "https://zangflix.local.invalid");
    return parsed.pathname === "/api/stream" &&
      (parsed.hostname === "saimo-tv.pages.dev" || parsed.hostname === "zangflix.local.invalid");
  } catch {
    return false;
  }
};

export interface UsePlayerEngineOptions {
  expectedRuntimeMin?: number;
  /** Reject short advertisement-only files, not regular short-form content. */
  minContentSeconds?: number;
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

// The production VOD player uses locally bundled engines, like LivePlayer.
// CDN script blockers and transient third-party outages must not prevent
// movies, series or anime episodes from starting.
let hlsPromise: Promise<NonNullable<Window["Hls"]>> | null = null;
let mpegtsPromise: Promise<NonNullable<Window["mpegts"]>> | null = null;

async function ensureHls() {
  if (window.Hls) return window.Hls;
  if (!hlsPromise) {
    hlsPromise = import("hls.js").then(module => {
      const engine = module.default as unknown as NonNullable<Window["Hls"]>;
      window.Hls = engine;
      return engine;
    }).catch(error => { hlsPromise = null; throw error; });
  }
  return hlsPromise;
}
async function ensureMpegts() {
  if (window.mpegts) return window.mpegts;
  if (!mpegtsPromise) {
    mpegtsPromise = import("mpegts.js").then(module => {
      const engine = (module.default ?? module) as unknown as NonNullable<Window["mpegts"]>;
      window.mpegts = engine;
      return engine;
    }).catch(error => { mpegtsPromise = null; throw error; });
  }
  return mpegtsPromise;
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

    // A origem Saimo pode redirecionar para MP4 com URL sem extensão.
    // Não force HLS pelo nome do endpoint: utilize formato explícito/detectado.
    const isHls =
      stream.format === "hls" ||
      stream.url.includes(".m3u8") ||
      stream.url.includes("/api/hls-proxy") ||
      stream.url.includes("embedplayer2.xyz") ||
      stream.url.includes("dadinhodetapioca.fun") ||
      stream.url.split("?")[0].toLowerCase().endsWith(".txt");

    // Timeout de metadata: 6s para relay HLS probe, 8s para as demais fontes
    const timeoutDuration = isRelay && isHls ? 9000 : 14000;

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

      // Resolução baixa não prova que o vídeo é um anúncio:
      // streams legítimos de anime podem ter apenas 240p/320x180.
      // Só a duração incompatível com duração real conhecida é sinal forte.

      // A runtime estimate is not proof of corrupt content. OVAs, shorts,
      // specials and split episodes can legitimately be far shorter than TMDB.
      // Only an extremely short clip on a feature-length title is suspicious.
      const expectedMin = options?.expectedRuntimeMin;
      const d = video.duration;
      if (options?.minContentSeconds && Number.isFinite(d) && d > 0 &&
          d < options.minContentSeconds) {
        triggerGarbageDetected(`Possível anúncio isolado (${Math.round(d)}s)`);
        return true;
      }
      if (expectedMin && expectedMin >= 40 && Number.isFinite(d) && d > 0 && d < 65) {
        triggerGarbageDetected(`Clip incompatível com filme completo (${Math.round(d)}s)`);
        return true;
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
          if (cancelled) return;
          if (mpegts?.isSupported()) {
            const player = mpegts.createPlayer({ type: "mpegts", url, isLive: false, cors: true });
            player.attachMediaElement(video);
            player.load();
            destroyRef.current = () => { player.unload(); player.destroy(); };
          }
        } else if (isHls && !isIOS && video.canPlayType("application/vnd.apple.mpegurl") === "") {
          const Hls = await ensureHls();
          if (cancelled) return;
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
  }, [stream, options?.attemptStage, options?.expectedRuntimeMin, options?.minContentSeconds]);

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
