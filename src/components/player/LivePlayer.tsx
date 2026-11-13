"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { CanalTV, FonteTV } from "@/lib/canais";
import { buildLiveProxyPath, classifyLiveSource, initialLiveMode, looksOffline, nextLiveMode, orderLiveSources, type LiveAccessMode, type LiveStreamFormat } from "@/lib/live-source";
import type { ProgramaEPG } from "@/lib/epg";
import { CastControl } from "./CastControl";
import { decideLiveCatchup, hlsLatencyOptions, mpegtsLatencyOptions, classifyLivePlaybackStall, nextLiveAutoRetryDelay, type LiveLatencyMode } from "@/lib/live-latency";
import { isMobileLandscapeTarget, shouldRotateFullscreenFallback, tryLockLandscape, unlockLandscape, type OrientationLock } from "@/lib/fullscreen-orientation";
import {
  sortStreamsByHealth,
  recordFailedSource,
  clearFailedSources,
  clearAllPlayerCaches,
  autoCleanPlayerCache,
} from "@/lib/player-storage";
import {
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Radio,
  RefreshCw,
  SlidersHorizontal,
  PictureInPicture2,
  Gauge,
  AlertCircle,
  Tv,
} from "lucide-react";

export interface LivePlayerProps {
  canal: CanalTV;
  epgAtual?: ProgramaEPG;
  onNextCanal?: () => void;
  onPrevCanal?: () => void;
  onToggleGuide?: () => void;
  onLoadingChange?: (loading: boolean) => void;
  /** Older deployments expose /api/live-proxy but not /api/tv/stream. */
  proxyBackend?: "checking" | "catalog" | "legacy" | "unavailable";
}

declare global {
  interface Window {
    Hls?: {
      new (config?: Record<string, unknown>): {
        loadSource: (url: string) => void;
        attachMedia: (el: HTMLVideoElement) => void;
        destroy: () => void;
        on: (event: string, cb: (...args: unknown[]) => void) => void;
        liveSyncPosition?: number;
      };
      isSupported: () => boolean;
      Events: { ERROR: string; MANIFEST_PARSED: string };
      ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string };
      DefaultConfig?: { loader: any };
    };
    mpegts?: {
      createPlayer: (config: Record<string, unknown>, options?: Record<string, unknown>) => {
        attachMediaElement: (el: HTMLVideoElement) => void;
        load: () => void;
        play: () => Promise<void>;
        pause: () => void;
        unload: () => void;
        destroy: () => void;
      };
      isSupported: () => boolean;
    };
    shaka?: any;
  }
}

// Carregamento único por CDN, mesmo após trocar rapidamente de canal ou fonte.
const scriptRequests = new Map<string, Promise<void>>();
async function loadScript(src: string): Promise<void> {
  let promise = scriptRequests.get(src);
  if (!promise) {
    promise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
      const script = existing || document.createElement("script");
      const onLoad = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error(`Falha ao carregar biblioteca: ${src}`)); };
      const cleanup = () => {
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
      };
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
      if (!existing) {
        script.src = src;
        script.async = true;
        document.head.appendChild(script);
      }
    });
    scriptRequests.set(src, promise);
  }
  try { await promise; } catch (error) { scriptRequests.delete(src); throw error; }
}

// Bundled engines: these dependencies already belong to the app and do not
// depend on a third-party CDN being reachable at playback time.
async function ensureHls() {
  if (!window.Hls) {
    const module = await import("hls.js");
    window.Hls = module.default as unknown as NonNullable<Window["Hls"]>;
  }
  return window.Hls;
}
async function ensureMpegts() {
  if (!window.mpegts) {
    const module = await import("mpegts.js");
    window.mpegts = (module.default ?? module) as unknown as NonNullable<Window["mpegts"]>;
  }
  return window.mpegts;
}
async function ensureShaka() {
  if (!window.shaka) {
    try {
      await loadScript("https://cdn.jsdelivr.net/npm/shaka-player@4.11.2/dist/shaka-player.compiled.js");
    } catch {
      await loadScript("https://unpkg.com/shaka-player@4.11.2/dist/shaka-player.compiled.js");
    }
    window.shaka?.polyfill?.installAll();
  }
  return window.shaka;
}

const LIVE_VOL_KEY = "zangflix:live-volume";
const SEM_CORS_KEY = "zangflix:sem-cors";

function getHostsSemCors(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SEM_CORS_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {}
  return [];
}

function hostSemCors(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return getHostsSemCors().includes(host);
  } catch {
    return false;
  }
}

function marcarSemCors(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const current = getHostsSemCors();
    if (!current.includes(host)) {
      const updated = [host, ...current].slice(0, 100);
      localStorage.setItem(SEM_CORS_KEY, JSON.stringify(updated));
    }
  } catch {}
}

function limparHostsSemCors() {
  try {
    localStorage.removeItem(SEM_CORS_KEY);
  } catch {}
}

const initialModeFor = (f: FonteTV | undefined): LiveAccessMode => {
  if (!f) return "proxy";
  return hostSemCors(f.url) ? "proxy" : initialLiveMode(f);
};

// Corrige caminhos em proxies de terceiros que aninham o stream no parâmetro url=
function fixNestedPath(parentUrl: string, childUrl: string): string {
  try {
    const parsedParent = new URL(parentUrl);
    const nested = parsedParent.searchParams.get("url");
    if (nested && !childUrl.startsWith("http://") && !childUrl.startsWith("https://")) {
      const baseUrl = new URL(nested);
      const resolvedChild = new URL(childUrl, baseUrl).toString();
      parsedParent.searchParams.set("url", resolvedChild);
      return parsedParent.toString();
    }
  } catch {}
  try {
    return new URL(childUrl, parentUrl).toString();
  } catch {
    return childUrl;
  }
}

function makeNestedPathLoader(HlsClass: any, sourceUrl: string) {
  return class NestedLoader extends HlsClass.DefaultConfig.loader {
    load(context: any, config: any, callbacks: any) {
      if (context && context.url) {
        context.url = fixNestedPath(sourceUrl, context.url);
      }
      super.load(context, config, callbacks);
    }
  };
}

export function LivePlayer({
  canal,
  epgAtual,
  onNextCanal,
  onPrevCanal,
  onToggleGuide,
  onLoadingChange,
  proxyBackend = "catalog",
}: LivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsInstanceRef = useRef<{ destroy: () => void; liveSyncPosition?: number | undefined } | null>(null);
  const shakaInstanceRef = useRef<{ destroy: () => Promise<unknown> | void } | null>(null);
  const attemptedModesRef = useRef<Map<string, Set<LiveAccessMode>>>(new Map());
  const handlingFailureRef = useRef(false);
  const autoRetryCountRef = useRef(0);
  const stablePlaybackSinceRef = useRef<number | null>(null);

  // Ordem https-first preservando a ordem curada do catálogo, com suporte total a DASH/ClearKey
  const validStreams = useMemo(() => {
    // Tenta primeiro os espelhos que responderam com mídia no diagnóstico.
    // Os CDNs problemáticos permanecem disponíveis como último recurso.
    const pool = canal.fontes.filter((f) => !looksOffline(f));
    return sortStreamsByHealth(orderLiveSources(pool));
  }, [canal.fontes]);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [attemptMode, setAttemptMode] = useState<"direct" | "proxy">(() =>
    initialModeFor(validStreams[0])
  );
  const [playNonce, setPlayNonce] = useState(0);
  const [useLegacyOnMismatch, setUseLegacyOnMismatch] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);
  const [error, setError] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theaterFullscreen, setTheaterFullscreen] = useState(false);
  const [rotateLandscapeFallback, setRotateLandscapeFallback] = useState(false);
  const orientationLockedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return 1;
    const saved = localStorage.getItem(LIVE_VOL_KEY);
    return saved !== null ? Number(saved) : 1;
  });
  const [isLiveEdge, setIsLiveEdge] = useState(true);
  const [latencyMode, setLatencyMode] = useState<LiveLatencyMode>(() => {
    if (typeof window === "undefined") return "fast";
    return window.localStorage.getItem("zangflix:live-latency-mode") === "stable" ? "stable" : "fast";
  });
  const [autoSwitchMsg, setAutoSwitchMsg] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [castOpen, setCastOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const onCastDialogChange = useCallback((open: boolean) => {
    setCastOpen(open);
    if (open) setSourcesOpen(false);
  }, []);

  useEffect(() => {
    if (!sourcesOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) setSourcesOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSourcesOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [sourcesOpen]);

  const [unmuteNotice, setUnmuteNotice] = useState(false);

  // Reseta ao trocar de canal
  useEffect(() => {
    autoCleanPlayerCache();
    attemptedModesRef.current.clear();
    handlingFailureRef.current = false;
    autoRetryCountRef.current = 0;
    stablePlaybackSinceRef.current = null;
    setSourceIndex(0);
    setUseLegacyOnMismatch(false);
    setAttemptMode(initialModeFor(validStreams[0]));
    setError(validStreams.length === 0);
    setErrorDetail(null);
    setLoading(validStreams.length > 0);
    setAutoSwitchMsg(null);
    setPlayNonce((n) => n + 1);
  }, [canal.id, validStreams]);

  const rawFonte: FonteTV | undefined = validStreams[sourceIndex];
  const autoRetryPending = error && nextLiveAutoRetryDelay(autoRetryCountRef.current, validStreams.length) !== null;

  // Seleciona a rota de proxy efetivamente disponível no deploy.
  // O catálogo remoto pode estar atualizado, enquanto o backend da Vercel
  // ainda não possui a rota nova /api/tv/stream.
  const streamUrl = useMemo(() => {
    if (!rawFonte?.url) return "";
    if (attemptMode === "direct") return rawFonte.url;
    const index = canal.fontes.findIndex((candidate) => candidate.url === rawFonte.url);
    return buildLiveProxyPath(canal.id, index, rawFonte, proxyBackend === "catalog" && !useLegacyOnMismatch);
  }, [rawFonte, attemptMode, canal.id, canal.fontes, proxyBackend, useLegacyOnMismatch]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (sourcesOpen || castOpen) return;
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3500);
  }, [sourcesOpen, castOpen]);

  useEffect(() => {
    if (!sourcesOpen && !castOpen) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setControlsVisible(true);
  }, [sourcesOpen, castOpen]);

  // O modo "Menor atraso" prefere o live edge, com margem de buffer
  // suficiente para evitar reconexões constantes em redes instáveis.
  const syncToLiveEdge = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const liveSync = hlsInstanceRef.current?.liveSyncPosition;
      if (Number.isFinite(liveSync)) {
        video.currentTime = liveSync!;
      } else if (video.seekable.length > 0) {
        const edge = video.seekable.end(video.seekable.length - 1);
        video.currentTime = Math.max(video.seekable.start(video.seekable.length - 1),
          edge - (latencyMode === "fast" ? 2.5 : 5));
      }
      video.playbackRate = 1;
      setIsLiveEdge(true);
    } catch { /* Vídeo ainda não possui intervalo válido para seek. */ }
  }, [latencyMode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const checkEdge = () => {
      if (!video.seekable.length || video.seeking) return;
      const last = video.seekable.length - 1;
      const edge = video.seekable.end(last);
      const safeStart = video.seekable.start(last);
      const buffered = video.buffered;
      let bufferAhead = 0;
      for (let i = 0; i < buffered.length; i++) {
        if (buffered.start(i) <= video.currentTime && buffered.end(i) >= video.currentTime) {
          bufferAhead = buffered.end(i) - video.currentTime;
          break;
        }
      }
      const hlsManaged = Boolean(hlsInstanceRef.current?.liveSyncPosition !== undefined);
      const decision = decideLiveCatchup({
        edge, current:video.currentTime,
        syncPosition:hlsInstanceRef.current?.liveSyncPosition,
        bufferAhead, stalled:video.readyState < 3,
        paused:video.paused, mode:latencyMode, hlsManaged,
      });
      setIsLiveEdge(decision.behind < (latencyMode === "fast" ? 12 : 20));
      if (decision.action === "seek") {
        const position = Math.max(safeStart + 0.05, Math.min(edge - 0.5, decision.position));
        if (position > video.currentTime + 0.5) video.currentTime = position;
      } else if (!hlsManaged) {
        video.playbackRate = decision.action === "speed" ? decision.rate : 1;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") checkEdge();
    };
    const interval = window.setInterval(checkEdge, 2500);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      if (video.playbackRate !== 1) video.playbackRate = 1;
    };
  }, [latencyMode, streamUrl]);

  const toggleLatencyMode = useCallback(() => {
    setLatencyMode(previous => {
      const next = previous === "fast" ? "stable" : "fast";
      try { window.localStorage.setItem("zangflix:live-latency-mode", next); } catch {}
      return next;
    });
    // Reconfigure HLS/MPEG-TS engine with the chosen buffer profile.
    setPlayNonce(value => value + 1);
  }, []);

  // Avança para a próxima fonte caso haja falha fatal (escada direto -> proxy -> próxima fonte)
  // Timeout e erro do motor de vídeo podem ocorrer juntos; alternar uma única vez.
  const handleFatalError = useCallback((isNetworkError = false) => {
    if (!rawFonte || handlingFailureRef.current) return;
    handlingFailureRef.current = true;
    stablePlaybackSinceRef.current = null;
    const key = `${canal.id}:${rawFonte.url}`;
    const attempted = attemptedModesRef.current.get(key) || new Set<LiveAccessMode>();
    attempted.add(attemptMode);
    attemptedModesRef.current.set(key, attempted);
    if (isNetworkError && attemptMode === "direct") marcarSemCors(rawFonte.url);
    const alternative = nextLiveMode(rawFonte, attemptMode, attempted);
    if (alternative) {
      setAttemptMode(alternative);
      setLoading(true);
      setError(false);
      setAutoSwitchMsg(alternative === "proxy" ? "Conectando via proxy…" : "Tentando conexão direta…");
      setPlayNonce((n) => n + 1);
      return;
    }
    recordFailedSource(rawFonte.url);
    if (sourceIndex + 1 < validStreams.length) {
      const next = sourceIndex + 1;
      setSourceIndex(next);
      setAttemptMode(initialModeFor(validStreams[next]));
      setLoading(true);
      setError(false);
      setAutoSwitchMsg("Trocando fonte…");
      setPlayNonce((n) => n + 1);
      return;
    }
    setLoading(false);
    setError(true);
    setAutoSwitchMsg(null);
  }, [rawFonte, canal.id, attemptMode, sourceIndex, validStreams]);

  // Ao esgotar as rotas/fontes, refaz automaticamente a mesma limpeza do
  // botão manual. Espera a aba ficar visível, com backoff e tentativas finitas.
  useEffect(() => {
    const delay = nextLiveAutoRetryDelay(autoRetryCountRef.current, validStreams.length);
    if (!error || delay === null) return;

    let retryTimer: number | null = null;
    let disposed = false;
    const restart = () => {
      retryTimer = null;
      if (disposed || document.visibilityState === "hidden") return;
      autoRetryCountRef.current += 1;
      clearAllPlayerCaches();
      attemptedModesRef.current.clear();
      handlingFailureRef.current = false;
      stablePlaybackSinceRef.current = null;
      setSourceIndex(0);
      setAttemptMode(initialModeFor(validStreams[0]));
      setErrorDetail(null);
      setAutoSwitchMsg("Restabelecendo transmissão…");
      setLoading(true);
      setError(false);
      setPlayNonce(n => n + 1);
    };
    const schedule = () => {
      if (disposed || retryTimer !== null || document.visibilityState === "hidden") return;
      retryTimer = window.setTimeout(restart, delay);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      } else {
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", schedule);
    schedule();
    return () => {
      disposed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", schedule);
    };
  }, [error, validStreams, canal.id]);

  // Detecta uma transmissão que perdeu os segmentos depois de começar a tocar.
  // Evita trocar o canal durante pausas normais, seek ou buffering curto.
  useEffect(() => {
    if (!rawFonte || loading || error) return;
    let last = videoRef.current?.currentTime ?? 0;
    let advancedAt = Date.now();
    const watchdog = window.setInterval(() => {
      const video = videoRef.current;
      // Background tabs and offline devices suspend media timers. Do not
      // blacklist a working channel because Android paused the webview.
      if (!video || video.paused || video.ended || video.seeking ||
          document.visibilityState === "hidden" || !navigator.onLine) {
        last = video?.currentTime ?? last;
        advancedAt = Date.now();
        return;
      }
      // Live playlists may jump backwards when the rolling window resets.
      // Any meaningful position change is progress, not a frozen stream.
      if (Math.abs(video.currentTime - last) > 0.3) {
        last = video.currentTime;
        advancedAt = Date.now();
      } else {
        const stall = classifyLivePlaybackStall({
          elapsedWithoutProgressMs: Date.now() - advancedAt,
          currentTime: video.currentTime,
          readyState: video.readyState,
          paused: video.paused,
          ended: video.ended,
          seeking: video.seeking,
        });
        if (!stall) return;
        advancedAt = Date.now();
        console.warn("[LivePlayer] Reprodução parada (" + stall + "); tentando outra rota ou fonte");
        // A falta de progressão com readyState=4 não prova CORS; reserve
        // o bloqueio do domínio ao caso de falha real de rede/buffer.
        handleFatalError(video.readyState < 3);
      }
    }, 3000);
    return () => window.clearInterval(watchdog);
  }, [rawFonte, loading, error, handleFatalError]);

  // Inicializa a reprodução do stream atual
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) {
      setLoading(false);
      if (!streamUrl) setError(true);
      return;
    }
    handlingFailureRef.current = false;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setErrorDetail(null);

    // Não considerar apenas readyState: o vídeo pode ter buffer e nunca iniciar.
    let playbackConfirmed = false;
    const timeout = setTimeout(() => {
      if (!cancelled && !playbackConfirmed) {
        console.warn(`[LivePlayer] Timeout ao conectar na fonte ${sourceIndex + 1} (${attemptMode})`);
        handleFatalError(false);
      }
    }, 18000);

    const onPlaying = () => {
      if (cancelled) return;
      playbackConfirmed = true;
      stablePlaybackSinceRef.current = Date.now();
      clearTimeout(timeout);
      setLoading(false);
      setError(false);
      setErrorDetail(null);
      setAutoSwitchMsg(null);
      if (video.muted) {
        setUnmuteNotice(true);
      }
    };

    const onTimeUpdate = () => {
      if (video.currentTime > 0.5) {
        setIsLiveEdge(true);
        // Um canal estável volta a ter direito a novas recuperações futuras.
        if (stablePlaybackSinceRef.current !== null && Date.now() - stablePlaybackSinceRef.current >= 45_000) {
          autoRetryCountRef.current = 0;
          stablePlaybackSinceRef.current = null;
        }
      }
    };

    const onError = () => {
      if (cancelled) return;
      clearTimeout(timeout);
      if (video.error?.code === 4) {
        setErrorDetail((existing) => existing || "O navegador não conseguiu abrir a fonte. A transmissão pode estar bloqueada ou usar um formato incompatível.");
      }
      handleFatalError(attemptMode === "direct");
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("error", onError);

    const setup = async () => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      let kind: LiveStreamFormat = rawFonte ? classifyLiveSource(rawFonte) : "auto";
      if (kind === "auto" && rawFonte) {
        const originalIndex = canal.fontes.findIndex((f) => f.url === rawFonte.url);
        if (originalIndex >= 0) {
          try {
            const response = await fetch(
              `/api/live-format?canal=${encodeURIComponent(canal.id)}&fonte=${originalIndex}`,
              { signal: AbortSignal.timeout(6500), cache: "no-store" },
            );
            if (response.ok) {
              const info = (await response.json()) as { format?: LiveStreamFormat };
              if (info.format && info.format !== "auto") kind = info.format;
            }
          } catch { /* O CDN pode estar inacessível ao backend. */ }
        }
      }
      if (cancelled) return;
      const isDash = kind === "dash";
      const isTs = kind === "ts";
      const isMp4 = kind === "mp4";

      try {
        // 1. DASH + ClearKey via Shaka Player
        if (isDash) {
          const shaka = await ensureShaka();
          if (!shaka?.Player?.isBrowserSupported?.()) {
            console.warn("[LivePlayer] Shaka Player não suportado neste navegador, pulando DASH...");
            handleFatalError(false);
            return;
          }

          if (cancelled) return;
          const player = new shaka.Player();
          await player.attach(video);

          if (rawFonte?.chave) {
            const [keyId, key] = rawFonte.chave.split(":").map((s) => s.trim().toLowerCase());
            if (keyId && key) {
              player.configure({
                drm: {
                  clearKeys: {
                    [keyId]: key,
                  },
                },
              });
            }
          }

          player.addEventListener("error", (event: any) => {
            console.warn("[LivePlayer] Erro Shaka Player:", event?.detail);
            if (!cancelled) handleFatalError(true);
          });

          await player.load(streamUrl);
          shakaInstanceRef.current = {
            destroy: () => player.destroy().catch(() => {}),
          };

          if (!cancelled) {
            try {
              await video.play();
            } catch {
              try {
                video.muted = true;
                setMuted(true);
                setUnmuteNotice(true);
                await video.play();
              } catch {}
            }
          }
          return;
        }

        // 2. MPEG-TS direto
        if (isTs) {
          const mpegts = await ensureMpegts();
          if (cancelled) return;
          if (mpegts?.isSupported()) {
            const player = mpegts.createPlayer({
              type: "mpegts",
              url: streamUrl,
              isLive: true,
              cors: true,
            }, mpegtsLatencyOptions(latencyMode));
            player.attachMediaElement(video);
            player.load();
            void player.play().catch(() => {
              video.muted = true;
              void player.play();
            });
            hlsInstanceRef.current = { destroy: () => { player.unload(); player.destroy(); } };
            return;
          }
        }

        // 3. MP4: reprodução nativa, sem passar conteúdo binário ao Hls.js.
        if (isMp4) {
          video.src = streamUrl;
          video.load();
        } else if (!isIOS && video.canPlayType("application/vnd.apple.mpegurl") === "") {
          const Hls = await ensureHls();
          if (cancelled) return;
          if (Hls?.isSupported()) {
            const hasNested = attemptMode === "direct" && rawFonte?.url.includes("url=");
            const hlsConfig: Record<string, unknown> = hlsLatencyOptions(latencyMode);

            if (hasNested && (Hls as any).DefaultConfig?.loader) {
              hlsConfig["loader"] = makeNestedPathLoader(Hls, rawFonte?.url || streamUrl);
            }

            const hls = new Hls(hlsConfig);

            hls.loadSource(streamUrl);
            hls.attachMedia(video);

            let recoveryCount = 0;
            hls.on(Hls.Events.ERROR, (_, data: any) => {
              if (!data?.fatal || cancelled) return;
              const isNet = data?.type === "networkError";
              const isMedia = data?.type === "mediaError";
              const responseCode = Number(data?.response?.code || data?.networkDetails?.status || 0);
              // Catalog lists refresh independently in the browser and on the
              // server. A 409 means the signature cannot be found server-side;
              // use the exact source URL via the existing legacy proxy.
              if (responseCode === 409 && attemptMode === "proxy" &&
                  proxyBackend === "catalog" && !useLegacyOnMismatch) {
                setUseLegacyOnMismatch(true);
                setErrorDetail(null);
                setAutoSwitchMsg("Sincronizando fonte atualizada…");
                setLoading(true);
                setPlayNonce(v => v + 1);
                return;
              }
              if (responseCode === 403 || responseCode === 401) {
                setErrorDetail("A origem recusou o acesso à transmissão (HTTP " + responseCode + "). Essa fonte exige autorização ou está bloqueada para esta conexão.");
              } else if (responseCode === 404 || responseCode === 410) {
                setErrorDetail("A playlist desta fonte não está mais disponível (HTTP " + responseCode + ").");
              } else if (responseCode === 429) {
                setErrorDetail("O servidor limitou as requisições (HTTP 429).");
              }
              // HTTP 401/403/404/410/429 não são erros transitórios de buffer.
              // Não desperdiçar até 18 s tentando recuperar uma playlist recusada.
              const persistentHttp = [401, 403, 404, 410, 429].includes(responseCode);
              if (!persistentHttp && recoveryCount < 1 && (isNet || isMedia)) {
                recoveryCount++;
                if (isNet && typeof (hls as any).startLoad === "function") {
                  (hls as any).startLoad(-1);
                  return;
                }
                if (isMedia && typeof (hls as any).recoverMediaError === "function") {
                  (hls as any).recoverMediaError();
                  return;
                }
              }
              console.warn("[LivePlayer] HLS indisponível após recuperação:", data?.details || data?.type);
              handleFatalError(isNet);
            });

            hlsInstanceRef.current = {
              destroy: () => hls.destroy(),
              get liveSyncPosition() {
                return hls.liveSyncPosition;
              },
            };
          } else {
            video.src = streamUrl;
          }
        } else {
          // Nativo Safari / iOS
          video.src = streamUrl;
        }

        if (!cancelled) {
          try {
            await video.play();
          } catch {
            try {
              video.muted = true;
              setMuted(true);
              setUnmuteNotice(true);
              await video.play();
            } catch {}
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[LivePlayer] Falha ao configurar vídeo:", err);
          handleFatalError(attemptMode === "direct");
        }
      }
    };

    void setup();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("error", onError);
      hlsInstanceRef.current?.destroy();
      hlsInstanceRef.current = null;
      shakaInstanceRef.current?.destroy();
      shakaInstanceRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [streamUrl, sourceIndex, attemptMode, playNonce, handleFatalError, latencyMode]);

  // Ao vivo não pausa: clique no vídeo muta ou desmuta o áudio
  const handleToggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted) {
      setUnmuteNotice(false);
    }
  }, []);

  const handleVolumeChange = useCallback((newVol: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = newVol;
    setVolume(newVol);
    if (newVol > 0 && video.muted) {
      video.muted = false;
      setMuted(false);
      setUnmuteNotice(false);
    }
    localStorage.setItem(LIVE_VOL_KEY, String(newVol));
  }, []);

  const isMobilePlayer = useCallback(() => {
    const coarse = typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    return isMobileLandscapeTarget({
      userAgent: navigator.userAgent,
      viewportWidth: window.innerWidth,
      coarsePointer: coarse,
    });
  }, []);

  const isPortrait = useCallback(() => {
    if (typeof window.matchMedia === "function") {
      return window.matchMedia("(orientation: portrait)").matches;
    }
    return window.innerHeight > window.innerWidth;
  }, []);

  const getOrientation = useCallback((): OrientationLock | null => {
    return typeof screen !== "undefined" ? (screen.orientation as OrientationLock | undefined) ?? null : null;
  }, []);

  const releaseOrientation = useCallback(() => {
    if (orientationLockedRef.current) {
      unlockLandscape(getOrientation());
      orientationLockedRef.current = false;
    }
    setRotateLandscapeFallback(false);
  }, [getOrientation]);

  const applyMobileLandscape = useCallback(async () => {
    if (!isMobilePlayer()) return;
    const locked = await tryLockLandscape(getOrientation());
    // A user may have closed fullscreen while the browser was deciding.
    if (!document.fullscreenElement || document.fullscreenElement !== containerRef.current) {
      if (locked) unlockLandscape(getOrientation());
      return;
    }
    orientationLockedRef.current = locked;
    setRotateLandscapeFallback(shouldRotateFullscreenFallback({
      mobile: true, portrait: isPortrait(), orientationLocked: locked,
    }));
  }, [isMobilePlayer, isPortrait, getOrientation]);

  // Fullscreen is a user gesture: enter first, then attempt Screen Orientation
  // lock (Android Chrome). iPhone Safari doesn't expose this API, so in portrait
  // we rotate the theater player instead of showing a tiny portrait video.
  const handleFullscreenToggle = useCallback(() => {
    const el = containerRef.current;
    const video = videoRef.current as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitExitFullscreen?: () => void;
      webkitDisplayingFullscreen?: boolean;
    }) | null;
    if (!el) return;

    if (theaterFullscreen) {
      setTheaterFullscreen(false);
      releaseOrientation();
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
      return;
    }
    if (video?.webkitDisplayingFullscreen) {
      video.webkitExitFullscreen?.();
      return;
    }

    const mobile = isMobilePlayer();
    const portrait = isPortrait();
    const fallback = () => {
      setTheaterFullscreen(true);
      setRotateLandscapeFallback(shouldRotateFullscreenFallback({
        mobile, portrait, orientationLocked: false,
      }));
    };

    // Safari on iPhone: portrait inline theater simulates landscape. Native
    // video fullscreen is still used when the device is already landscape.
    if (mobile && /iPhone|iPod/i.test(navigator.userAgent) && portrait) {
      fallback();
      return;
    }
    if (mobile && /iPhone|iPod/i.test(navigator.userAgent) && video?.webkitEnterFullscreen) {
      try { video.webkitEnterFullscreen(); return; } catch { fallback(); return; }
    }
    if (typeof el.requestFullscreen === "function") {
      void el.requestFullscreen()
        .then(() => { void applyMobileLandscape(); })
        .catch(fallback);
      return;
    }
    const webkitContainer = el as HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    if (webkitContainer.webkitRequestFullscreen) {
      try {
        const result = webkitContainer.webkitRequestFullscreen();
        void Promise.resolve(result).then(() => {
          if (document.fullscreenElement) void applyMobileLandscape();
          else if (mobile && portrait) fallback();
        }).catch(fallback);
        return;
      } catch { fallback(); return; }
    }
    if (video?.webkitEnterFullscreen) {
      try { video.webkitEnterFullscreen(); return; } catch { fallback(); return; }
    }
    fallback();
  }, [theaterFullscreen, isMobilePlayer, isPortrait, applyMobileLandscape, releaseOrientation]);

  useEffect(() => {
    const video = videoRef.current;
    const onFullscreenChange = () => {
      const native = Boolean(document.fullscreenElement);
      setIsFullscreen(native || theaterFullscreen);
      if (!native && !theaterFullscreen) releaseOrientation();
    };
    const onNativeStart = () => setIsFullscreen(true);
    const onNativeEnd = () => {
      setIsFullscreen(false);
      releaseOrientation();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && theaterFullscreen) {
        setTheaterFullscreen(false);
        releaseOrientation();
        event.preventDefault();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    video?.addEventListener("webkitbeginfullscreen", onNativeStart);
    video?.addEventListener("webkitendfullscreen", onNativeEnd);
    window.addEventListener("keydown", onEscape);
    onFullscreenChange();
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      video?.removeEventListener("webkitbeginfullscreen", onNativeStart);
      video?.removeEventListener("webkitendfullscreen", onNativeEnd);
      window.removeEventListener("keydown", onEscape);
    };
  }, [theaterFullscreen, releaseOrientation]);

  useEffect(() => {
    if (!theaterFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [theaterFullscreen]);

  useEffect(() => () => {
    if (orientationLockedRef.current) {
      unlockLandscape(typeof screen !== "undefined" ? screen.orientation as OrientationLock : null);
      orientationLockedRef.current = false;
    }
  }, []);

  const handlePiPToggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => {});
    } else if (document.pictureInPictureEnabled) {
      void video.requestPictureInPicture().catch(() => {});
    }
  }, []);

  // Atalhos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        onPrevCanal?.();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        onNextCanal?.();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        handleToggleMute();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        handleFullscreenToggle();
      } else if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        onToggleGuide?.();
      }
      showControls();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPrevCanal, onNextCanal, handleToggleMute, handleFullscreenToggle, onToggleGuide, showControls]);

  return (
    <div
      ref={containerRef}
      className={"ydo-live-player-container" + (theaterFullscreen ? " is-theater" : "") + (rotateLandscapeFallback ? " is-landscape-fallback" : "")}
      data-controls-visible={controlsVisible}
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      <video
        ref={videoRef}
        className="ydo-live-video"
        playsInline
        preload="none"
        webkit-playsinline="true"
        onClick={handleToggleMute}
      />

      {/* Camada de clique: clicar no vídeo muta/desmuta (ao vivo nunca pausa) */}
      <div
        className="ydo-live-click-layer"
        onClick={handleToggleMute}
        aria-label="Ativar ou desativar áudio"
      />

      {/* Alerta discreto quando autoplay iniciou mutado */}
      {unmuteNotice && muted && (
        <button
          onClick={handleToggleMute}
          className="ydo-live-unmute-pill animate-fade-in"
          aria-label="Clique para ativar o áudio do canal"
        >
          <VolumeX size={15} />
          <span>Clique para ativar áudio</span>
        </button>
      )}

      {/* Selo de troca automática de fonte */}
      {autoSwitchMsg && (
        <div className="ydo-live-autoswitch-badge animate-fade-in">
          <RefreshCw size={13} className="animate-spin" />
          <span>{autoSwitchMsg}</span>
        </div>
      )}

      {/* Topbar com nome do canal, categoria e programa atual */}
      <div className={`ydo-live-topbar ${controlsVisible ? "visible" : ""}`}>
        <div className="ydo-live-topbar-info">
          <div className="ydo-live-badge-row">
            <span className={`ydo-live-pulse-dot ${isLiveEdge ? "is-live" : "is-behind"}`} />
            <span className="ydo-live-badge-text">AO VIVO</span>
            <span className="ydo-live-cat-tag">{canal.categoria}</span>
          </div>
          <h2 className="ydo-live-channel-title">{canal.nome}</h2>
          {epgAtual?.titulo && (
            <p className="ydo-live-epg-subtitle">
              {epgAtual.horario ? `${epgAtual.horario} · ` : ""}
              {epgAtual.titulo}
            </p>
          )}
        </div>
      </div>

      {/* Skeleton de carregamento elegante */}
      {loading && !error && (
        <div className="ydo-live-skeleton-overlay" aria-live="polite">
          <div className="ydo-live-skeleton-glow" />
          <div className="ydo-live-loading-content">
            <Tv size={36} className="ydo-live-loading-icon" />
            <div className="ydo-live-skeleton-bar short" />
            <div className="ydo-live-skeleton-bar" />
            <span>Sintonizando…</span>
          </div>
        </div>
      )}

      {/* Estado de erro após esgotar todas as fontes */}
      {error && (
        <div className="ydo-live-error-overlay">
          <AlertCircle size={44} style={{ color: "#e8b44a" }} />
          <h3>{autoRetryPending ? "Reconectando automaticamente…" : validStreams.length > 0 ? "Nenhum servidor disponível para este canal" : "Canal sem fonte ativa no catálogo"}</h3>
          <p>
            {autoRetryPending ? "A transmissão foi interrompida. Renovando a conexão e limpando o histórico temporário de falhas sem precisar clicar." : errorDetail ||
              (validStreams.length > 0
                ? `Tentamos as ${validStreams.length} fontes cadastradas. Algumas podem estar bloqueadas ou fora do ar.`
                : "O Zang Flix mantém este canal no catálogo, mas as fontes atuais estão temporariamente indisponíveis.")}
          </p>
          <button
            className="ydo-btn-primary"
            onClick={() => {
              attemptedModesRef.current.clear();
              handlingFailureRef.current = false;
              autoRetryCountRef.current = 0;
              stablePlaybackSinceRef.current = null;
              clearAllPlayerCaches();
              limparHostsSemCors();
              setSourceIndex(0);
              setAttemptMode(initialModeFor(validStreams[0]));
              setError(false);
              setErrorDetail(null);
              setLoading(true);
              setPlayNonce((n) => n + 1);
            }}
          >
            <RefreshCw size={15} /> Limpar Cache e Tentar Novamente
          </button>
          {onNextCanal && (
            <button className="ydo-btn-secondary" type="button" onClick={onNextCanal}>
              Tentar próximo canal
            </button>
          )}
        </div>
      )}

      {/* Uma única barra minimalista, sem os antigos estilos concorrentes. */}
      <div className={"zf-player-toolbar" + (controlsVisible ? " is-visible" : "")}
        role="toolbar" aria-label="Controles da TV ao vivo">
        <div className="zf-player-tools-start">
          <button type="button" className="zf-player-action"
            onClick={handleToggleMute}
            aria-label={muted || volume === 0 ? "Ativar som" : "Desativar som"}
            title={muted || volume === 0 ? "Ativar som" : "Desativar som"}>
            {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button type="button"
            className={"zf-player-live" + (isLiveEdge ? " is-live" : "")}
            onClick={syncToLiveEdge}
            title={isLiveEdge ? "Transmissão ao vivo" : "Voltar para o ao vivo"}
            aria-label={isLiveEdge ? "Ao vivo" : "Voltar para o ao vivo"}>
            <span className="zf-player-live-dot" aria-hidden="true" />
            <span className="zf-player-live-text">AO VIVO</span>
          </button>
        </div>
        <div className="zf-player-tools-end">
          <div className="zf-player-settings" ref={settingsRef}>
            <button type="button" className="zf-player-action"
              aria-expanded={sourcesOpen}
              aria-haspopup="dialog"
              aria-label="Qualidade e ajustes de reprodução"
              title="Qualidade e ajustes"
              onClick={() => setSourcesOpen(open => !open)}>
              <SlidersHorizontal size={16} />
            </button>
            {sourcesOpen && (
              <div className="zf-player-menu" role="dialog" aria-label="Qualidade e ajustes de reprodução">
                <div className="zf-player-menu-header">Ajustes do player</div>
                <label className="zf-player-volume-control">
                  <span>Volume</span>
                  <input type="range" min={0} max={1} step={0.05}
                    value={muted ? 0 : volume}
                    onChange={(event) => handleVolumeChange(Number(event.target.value))}
                    aria-label="Volume" />
                </label>
                <button type="button" className="zf-player-menu-option"
                  onClick={() => { toggleLatencyMode(); setSourcesOpen(false); }}>
                  <Gauge size={15} />
                  <span>{latencyMode === "fast" ? "Menor atraso" : "Modo estável"}</span>
                  <span className="zf-player-menu-hint">Alternar</span>
                </button>
                <button type="button" className="zf-player-menu-option"
                  onClick={() => { handlePiPToggle(); setSourcesOpen(false); }}>
                  <PictureInPicture2 size={15} />
                  <span>Janela flutuante</span>
                </button>
                <div className="zf-player-menu-subtitle">Servidores e qualidade</div>
                {validStreams.map((f, i) => (
                  <button key={f.url + i} type="button"
                    className={"zf-player-menu-option" + (i === sourceIndex ? " is-selected" : "")}
                    onClick={() => {
                      attemptedModesRef.current.delete(`${canal.id}:${f.url}`);
                      handlingFailureRef.current = false;
                      setSourceIndex(i);
                      setAttemptMode(initialModeFor(f));
                      setSourcesOpen(false);
                      setLoading(true);
                      setError(false);
                      setPlayNonce(n => n + 1);
                    }}>
                    <SlidersHorizontal size={14} />
                    <span className="zf-player-menu-server">{f.nome || f.qualidade || `Servidor ${i + 1}`}</span>
                    {f.qualidade && <span className="zf-player-menu-hint">{f.qualidade}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <CastControl videoRef={videoRef} source={rawFonte}
            streamUrl={streamUrl} channelName={canal.nome}
            onDialogChange={onCastDialogChange} settingsOpen={sourcesOpen} />
          <button type="button" className="zf-player-action"
            onClick={handleFullscreenToggle}
            aria-label={isFullscreen ? "Sair da tela cheia" : "Assistir em tela cheia"}
            title={isFullscreen ? "Sair da tela cheia" : "Tela cheia (F)"}>
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
