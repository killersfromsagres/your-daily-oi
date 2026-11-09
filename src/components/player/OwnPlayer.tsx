"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, RefreshCw, ArrowLeft, Play, Volume2, Sparkles } from "lucide-react";
import { usePlayerEngine, isRelaySource } from "./usePlayerEngine";
import { useVideoEnhancer } from "./useVideoEnhancer";
import { PlayerControls } from "./PlayerControls";
import type { StreamSource } from "@/lib/types";
import {
  recordFailedSource,
  sortStreamsByHealth,
  clearFailedSources,
  clearAllPlayerCaches,
  autoCleanPlayerCache,
  getFailedUrls,
  setPreferredAudio,
} from "@/lib/player-storage";
import { APP_VERSION } from "@/lib/version";
import { proxyUrlForSaimoRelay } from "@/lib/saimo-vod-url";
import { bestVodSourceIndex, playableVodSources, nextVodSourceIndex, advertisedVodResolution } from "@/lib/vod-source-quality";

// Cache negativo de sessão para estágio 0 (HLS probe) do relay Saimo
const stage0FailedRelays = new Map<string, number>();
const RELAY_FAILURE_TTL_MS = 90_000;

interface OwnPlayerProps {
  streams: StreamSource[];
  poster?: string;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  initialTime?: number;
  onTimeUpdate?: (t: number, duration?: number) => void;
  onEnded?: () => void;
  preferredAudio?: "dub" | "leg";
  expectedRuntimeMin?: number;
}

// 4b: Ordem de tentativa por tipo de relay
const getPreferredAttemptIsProxy = (url: string): boolean => {
  if (!url) return false;
  if (url.startsWith("/api/saimo-vod")) return false;
  // Relay Saimo / local /api/stream: direto-first
  if (isRelaySource(url)) {
    return false;
  }
  // Fontes diretas https:// que são MP4 tocam direto no navegador primeiro
  if (url.startsWith("https://") && !url.includes(".m3u8") && !url.includes(".txt") && !url.includes("embedplayer2.xyz")) {
    return false;
  }
  // Fontes diretas com CORS/hotlink/mixed-content vão via proxy primeiro
  return true;
};

const isHlsStream = (url: string, format?: string): boolean => {
  if (format === "hls") return true;
  if (!url) return false;
  const clean = url.split("?")[0].toLowerCase();
  return (
    clean.endsWith(".m3u8") ||
    clean.endsWith(".txt") ||
    url.includes(".m3u8") ||
    url.includes("embedplayer2.xyz") ||
    url.includes("dadinhodetapioca.fun")
  );
};

const getStreamUrlForStage = (
  rawUrl: string,
  stage: 0 | 1,
  format?: string,
  resolvedDirectUrl?: string
): string => {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("/api/saimo-vod")) return rawUrl;
  if (rawUrl.includes("/api/hls-proxy") || rawUrl.includes("/api/proxy-stream") || rawUrl.includes("/api/live-proxy")) return rawUrl;

  // Mesmo endpoint do Saimo: primeiro acesso direto (MP4 nativo);
  // na segunda tentativa, entrega pelo backend com Range e redirecionamentos.
  if (isRelaySource(rawUrl)) {
    if (stage === 0) return resolvedDirectUrl || rawUrl;
    return proxyUrlForSaimoRelay(rawUrl) || `/api/live-proxy?url=${encodeURIComponent(rawUrl)}`;
  }

  // HLS (.m3u8, .txt, embedplayer2):
  // Estágio 0: /api/live-proxy?url=... (proxy resolve hotlink/CORS/mixed-content)
  // Estágio 1: URL direta tocada no navegador pelo hls.js (muitos CDNs bloqueiam datacenter mas servem IP residencial)
  if (isHlsStream(rawUrl, format)) {
    let proxyUrl = `/api/live-proxy?url=${encodeURIComponent(rawUrl)}`;
    if (rawUrl.includes("embedplayer2.xyz")) {
      proxyUrl += `&referer=${encodeURIComponent("https://embedplayer2.xyz/")}`;
    }
    if (stage === 0) {
      return proxyUrl;
    }
    // Se a URL HLS for http:// (mixed-content garantido no direto), NÃO tente o estágio 1
    // Retorna a mesma URL do estágio 0 para ativar a regra anti-estágio-duplicado
    if (rawUrl.startsWith("http://")) {
      return proxyUrl;
    }
    return resolvedDirectUrl || rawUrl;
  }

  // Se a URL for http://, mixed-content impede direto no navegador em HTTPS, usa proxy
  if (rawUrl.startsWith("http://")) {
    return `/api/live-proxy?url=${encodeURIComponent(rawUrl)}`;
  }

  const preferredIsProxy = getPreferredAttemptIsProxy(rawUrl);
  const useProxy = stage === 0 ? preferredIsProxy : !preferredIsProxy;
  if (useProxy) {
    return `/api/live-proxy?url=${encodeURIComponent(rawUrl)}`;
  }
  return resolvedDirectUrl || rawUrl;
};

/** Backward compatible selector for existing UI and tests. */
export function pickBestSourceIndex(streams: StreamSource[], preferredAudio: "dub" | "leg" = "dub"): number {
  const index = bestVodSourceIndex(streams, {preferredAudio, failedUrls: getFailedUrls()});
  return Math.max(0, index);
}

export function OwnPlayer({
  streams,
  poster,
  title,
  subtitle,
  onBack,
  initialTime = 0,
  onTimeUpdate,
  onEnded,
  preferredAudio = "dub",
  expectedRuntimeMin,
}: OwnPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the active source at the same index while asynchronous provider
  // results arrive. Reordering an in-use index previously swapped the playing
  // URL under the video element and caused unexpected playback restarts.
  const stableSourcesRef = useRef<StreamSource[]>([]);
  const orderedStreams = useMemo(() => {
    const candidates = sortStreamsByHealth(playableVodSources(streams));
    const urls = new Set(candidates.map(item => item.url));
    const retained = stableSourcesRef.current.filter(item => urls.has(item.url));
    const existing = new Set(retained.map(item => item.url));
    const additions = candidates.filter(item => !existing.has(item.url));
    const result = [...retained, ...additions];
    stableSourcesRef.current = result;
    return result;
  }, [streams]);

  // A new title starts with Portuguese dubbing even if subtitles were chosen
  // manually on a previous film. Explicit manual changes still work here.
  const [sourceIndex, setSourceIndex] = useState(() => pickBestSourceIndex(orderedStreams, preferredAudio));
  const [attemptStage, setAttemptStage] = useState<0 | 1>(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasSeekedToInitial, setHasSeekedToInitial] = useState(false);
  const [autoSwitchMsg, setAutoSwitchMsg] = useState<string | null>(null);
  const [detectedQuality, setDetectedQuality] = useState<string | null>(null);
  const autoSwitchCountRef = useRef(0);
  const rejectedDuringPlaybackRef = useRef(new Set<string>());
  const measuredHeightsRef = useRef(new Map<string,number>());
  const metadataFirstSeenRef = useRef(new Map<string,number>());
  const manualSelectionRef = useRef(false);
  const qualitySwitchesRef = useRef(0);
  const hasEverPlayedRef = useRef(false);
  const pendingPlayRef = useRef<{ clickedAt: number } | null>(null);
  const lastProgressRef = useRef<{ time: number; at: number } | null>(null);
  const resolvedRelaysRef = useRef<Map<string, { finalUrl: string; isHls: boolean }>>(new Map());

  const [resolvedDirectUrl, setResolvedDirectUrl] = useState<string | null>(null);
  const [resolvedIsHls, setResolvedIsHls] = useState<boolean | null>(null);

  const chooseNextApprovedSource = useCallback((): boolean => {
    const current = orderedStreams[sourceIndex];
    if (current) rejectedDuringPlaybackRef.current.add(current.url);
    const next = nextVodSourceIndex(orderedStreams, sourceIndex, rejectedDuringPlaybackRef.current, {
      preferredAudio,
      failedUrls: getFailedUrls(),
      observedHeights: measuredHeightsRef.current,
    });
    if (next < 0) return false;
    setSourceIndex(next);
    setAttemptStage(0);
    setResolvedDirectUrl(null);
    setResolvedIsHls(null);
    setDetectedQuality(null);
    setAutoSwitchMsg(null);
    return true;
  }, [orderedStreams, sourceIndex, preferredAudio]);

  // A newly discovered high-quality dub can win while the first source is
  // still loading, but a film that already plays is never restarted merely
  // because an unrelated provider finished its request.
  useEffect(() => {
    if (hasEverPlayedRef.current || manualSelectionRef.current || orderedStreams.length === 0) return;
    const best = bestVodSourceIndex(orderedStreams, {
      preferredAudio, failedUrls: getFailedUrls(),
      observedHeights: measuredHeightsRef.current,
      excludedUrls: rejectedDuringPlaybackRef.current,
    });
    if (best < 0) return;
    setSourceIndex(previous => {
      if (previous === best) return previous;
      setAttemptStage(0);
      setResolvedDirectUrl(null);
      setResolvedIsHls(null);
      return best;
    });
  }, [orderedStreams, preferredAudio]);


  // Subtitle fallback can start before the verified Portuguese-dubbed source
  // appears. Switch automatically when the dubbed result arrives, preserving
  // the saved playback time, unless the viewer manually chose subtitles.
  useEffect(() => {
    if (preferredAudio !== "dub" || manualSelectionRef.current) return;
    const active = orderedStreams[sourceIndex];
    if (!active || active.audio === "dub") return;
    const best = bestVodSourceIndex(orderedStreams, {
      preferredAudio:"dub",
      failedUrls:getFailedUrls(),
      observedHeights:measuredHeightsRef.current,
      excludedUrls:rejectedDuringPlaybackRef.current,
    });
    const candidate = best >= 0 ? orderedStreams[best] : null;
    if (!candidate || candidate.audio !== "dub" || candidate.audioDeclared === false) return;
    setSourceIndex(best);
    setAttemptStage(0);
    setResolvedDirectUrl(null);
    setResolvedIsHls(null);
    setDetectedQuality(null);
    setAutoSwitchMsg("Selecionando áudio dublado…");
  }, [orderedStreams, preferredAudio]);

  // B1/B2: Upscaling HQ via WebGL2 shaders
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hqEnabled, setHqEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("zangflix:hq-enhance");
    return saved !== null ? saved === "true" : true;
  });
  const [hqNotice, setHqNotice] = useState<string | null>(null);

  const handleHqDowngrade = useCallback(() => {
    setHqEnabled(false);
    setHqNotice("HQ desativado por desempenho");
    setTimeout(() => setHqNotice(null), 4000);
  }, []);

  const enhancer = useVideoEnhancer(videoRef, canvasRef, hqEnabled, handleHqDowngrade);

  const toggleHq = useCallback(() => {
    setHqEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("zangflix:hq-enhance", String(next));
      } catch {}
      return next;
    });
  }, []);

  const updateVideoResolution = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const h = v.videoHeight;
    const w = v.videoWidth;
    if (h >= 2160 || w >= 3840) setDetectedQuality("4K");
    else if (h >= 1440 || w >= 2560) setDetectedQuality("2K");
    else if (h >= 1080 || w >= 1920) setDetectedQuality("1080p");
    else if (h >= 720 || w >= 1280) setDetectedQuality("720p");
    else if (h >= 480) setDetectedQuality("480p");
    else if (h > 0) setDetectedQuality(`${h}p`);
  }, []);

  const lastTimeRef = useRef(initialTime);

  useEffect(() => {
    autoCleanPlayerCache();
    console.info(`[Zang Flix Player] build ${APP_VERSION.version} (${APP_VERSION.commit})`);
  }, []);

  const rawStream = orderedStreams[sourceIndex] ?? null;
  const isRelay = isRelaySource(rawStream?.url);

  // Pula estágio 0 (HLS probe) se este relay já falhou HLS na sessão
  useEffect(() => {
    if (rawStream?.url && isRelaySource(rawStream.url)) {
      const failedAt = stage0FailedRelays.get(rawStream.url);
      if (failedAt && Date.now() - failedAt < RELAY_FAILURE_TTL_MS) {
        setAttemptStage(1);
      } else {
        stage0FailedRelays.delete(rawStream.url);
      }
    }
  }, [rawStream?.url]);

  // Cada fonte tenta o caminho preferido (stage 0) e depois o outro (stage 1), mantendo currentTime
  const currentStream: StreamSource | null = useMemo(() => {
    if (!rawStream) return null;
    if (isRelay) {
      return {
        ...rawStream,
        format: resolvedIsHls === true ? "hls" : "auto",
        url: getStreamUrlForStage(rawStream.url, attemptStage, rawStream.format, resolvedDirectUrl || undefined),
      };
    }
    const finalUrl = getStreamUrlForStage(rawStream.url, attemptStage, rawStream.format, resolvedDirectUrl || undefined);
    const fmt = resolvedIsHls ? "hls" : rawStream.format;
    return {
      ...rawStream,
      format: fmt,
      url: finalUrl,
    };
  }, [rawStream, attemptStage, isRelay, resolvedDirectUrl, resolvedIsHls]);

  const handleEnded = useCallback(() => {
    onEnded?.();
  }, [onEnded]);

  // TDZ SAFE: Declarado antes de qualquer useEffect/handler que o cite
  const engine = usePlayerEngine(videoRef, currentStream, handleEnded, {
    expectedRuntimeMin,
    attemptStage,
  });

  // Mantém currentTime atualizado para transferir caso haja chaveamento de rota ou fonte
  useEffect(() => {
    if (engine.currentTime > 0) {
      lastTimeRef.current = engine.currentTime;
    }
  }, [engine.currentTime]);

  // Restaura currentTime quando o vídeo ficar pronto ou começar a tocar
  useEffect(() => {
    if ((engine.state === "ready" || engine.state === "playing") && lastTimeRef.current > 0) {
      if (Math.abs(engine.currentTime - lastTimeRef.current) > 2) {
        engine.seek(lastTimeRef.current);
      }
    }
  }, [engine.state, currentStream]);

  // A6: Se a fonte for relay e estiver em estágio direto, resolve no backend para obter a URL final
  useEffect(() => {
    if (!rawStream?.url) return;
    if (!rawStream.url.includes("saimo-tv.pages.dev/api/stream")) return;

    const preferredIsProxy = getPreferredAttemptIsProxy(rawStream.url);
    const isDirect = (attemptStage === 0 && !preferredIsProxy) || (attemptStage === 1 && preferredIsProxy);
    if (!isDirect) return;

    const cached = resolvedRelaysRef.current.get(rawStream.url);
    if (cached) {
      if (resolvedDirectUrl !== cached.finalUrl || resolvedIsHls !== cached.isHls) {
        setResolvedDirectUrl(cached.finalUrl);
        setResolvedIsHls(cached.isHls);
      }
      return;
    }

    let active = true;
    fetch(`/api/relay-resolve?url=${encodeURIComponent(rawStream.url)}`)
      .then((res) => res.json())
      .then((data: { ok: boolean; finalUrl?: string; isHls?: boolean }) => {
        if (!active) return;
        if (data.ok && data.finalUrl) {
          resolvedRelaysRef.current.set(rawStream.url, {
            finalUrl: data.finalUrl,
            isHls: !!data.isHls,
          });
          setResolvedDirectUrl(data.finalUrl);
          setResolvedIsHls(!!data.isHls);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [rawStream?.url, attemptStage, resolvedDirectUrl, resolvedIsHls]);

  // Detecta HLS de origem same-origin sem baixar vídeo; MP4 toca nativamente.
  useEffect(() => {
    if (!rawStream?.url.startsWith("/api/saimo-vod") || rawStream.format !== "auto") return;
    let active = true;
    const url = rawStream.url + (rawStream.url.includes("?") ? "&" : "?") + "probe=1";
    fetch(url, { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data: { format?: string } | null) => {
        if (active && data?.format === "hls") setResolvedIsHls(true);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [rawStream?.url, rawStream?.format]);

  // Chaveamento inteligente:
  // 1. Relay: nativo MP4/Auto -> mesmo stream pelo proxy -> próxima fonte
  // 2. Catálogo: Estágio 0 (proxy/direto) -> Estágio 1 (inverso) -> próxima fonte
  useEffect(() => {
    if (engine.state === "error" && rawStream) {
      if (isRelaySource(rawStream.url)) {
        if (attemptStage === 0) {
          console.warn(`[OwnPlayer] Relay direto falhou para ${rawStream.url}. Tentando o proxy de mídia com Range...`);
          stage0FailedRelays.set(rawStream.url, Date.now());
          setAttemptStage(1);
          return;
        }

        // Após a segunda tentativa, passa para fontes de catálogo alternativas.
        console.warn(`[OwnPlayer] Relay direto e proxy falharam para ${rawStream.url}. Próxima fonte...`);
        recordFailedSource(rawStream.url);
        autoSwitchCountRef.current++;
        if (autoSwitchCountRef.current > orderedStreams.length * 3) {
          console.warn(`[OwnPlayer] Limite máximo de tentativas automáticas atingido (${autoSwitchCountRef.current}).`);
          setAutoSwitchMsg(null);
          return;
        }
        if (hasEverPlayedRef.current) {
          setAutoSwitchMsg("Trocando de servidor…");
        }
        const timer = setTimeout(() => {
          chooseNextApprovedSource();

        }, 800);
        return () => clearTimeout(timer);
      }

      // Fontes de catálogo (não relay)
      if (attemptStage === 0) {
        const currUrl = getStreamUrlForStage(rawStream.url, 0, rawStream.format);
        const nextUrl = getStreamUrlForStage(rawStream.url, 1, rawStream.format);
        if (currUrl === nextUrl) {
          console.warn(`[OwnPlayer] Estágio 1 duplicado (${currUrl}). Avançando diretamente para próxima fonte...`);
          recordFailedSource(rawStream.url);
          autoSwitchCountRef.current++;
          if (autoSwitchCountRef.current > orderedStreams.length * 3) {
            console.warn(`[OwnPlayer] Limite máximo de tentativas automáticas atingido (${autoSwitchCountRef.current}).`);
            setAutoSwitchMsg(null);
            return;
          }
          if (hasEverPlayedRef.current) {
            setAutoSwitchMsg("Trocando de servidor…");
          }
          const timer = setTimeout(() => {
            chooseNextApprovedSource();

          }, 800);
          return () => clearTimeout(timer);
        }

        console.warn(`[OwnPlayer] Falha no estágio inicial para ${rawStream.url}. Preparando estágio alternativo...`);
        setResolvedDirectUrl(null);
        setResolvedIsHls(null);
        setAttemptStage(1);
        return;
      }

      // Ambos os caminhos falharam para esta fonte: registra falha e avança (A3: escada circular)
      recordFailedSource(rawStream.url);

      // Teto de tentativas por sessão para evitar ciclo sem fim
      autoSwitchCountRef.current++;
      if (autoSwitchCountRef.current > orderedStreams.length * 3) {
        console.warn(`[OwnPlayer] Limite máximo de tentativas automáticas atingido (${autoSwitchCountRef.current}).`);
        setAutoSwitchMsg(null);
        return;
      }

      if (hasEverPlayedRef.current) {
        setAutoSwitchMsg("Trocando de servidor…");
      }
      const timer = setTimeout(() => {
        chooseNextApprovedSource();

      }, 800);
      return () => clearTimeout(timer);
    }
  }, [engine.state, rawStream, attemptStage, orderedStreams.length, chooseNextApprovedSource]);

  // O selo de troca automática some assim que qualquer fonte entra em reprodução
  useEffect(() => {
    if (engine.state === "playing") {
      hasEverPlayedRef.current = true;
    }
    if ((engine.state === "ready" || engine.state === "playing") && autoSwitchMsg !== null) {
      setAutoSwitchMsg(null);
    }
  }, [engine.state, autoSwitchMsg]);

  const handlePlay = useCallback(() => {
    pendingPlayRef.current = { clickedAt: Date.now() };
    void engine.play();
  }, [engine]);

  // Watchdog de "play travado" e "congelamento mid-play" (A5)
  useEffect(() => {
    const id = setInterval(() => {
      // A5: Watchdog de congelamento mid-play
      if (engine.state === "playing") {
        const now = Date.now();
        if (!lastProgressRef.current || Math.abs(engine.currentTime - lastProgressRef.current.time) > 0.5) {
          lastProgressRef.current = { time: engine.currentTime, at: now };
        } else {
          const elapsed = now - lastProgressRef.current.at;
          if (elapsed > 15000 && engine.buffered <= engine.currentTime + 2) {
            console.warn(`[OwnPlayer] Congelamento mid-play detectado (sem avanço há ${Math.round(elapsed / 1000)}s). Trocando de servidor...`);
            lastProgressRef.current = null;
            if (rawStream) {
              recordFailedSource(rawStream.url);
              autoSwitchCountRef.current++;
              if (autoSwitchCountRef.current <= orderedStreams.length * 2) {
                setAutoSwitchMsg("Trocando de servidor…");
                chooseNextApprovedSource();
setTimeout(() => setAutoSwitchMsg(null), 1200);
              }
            }
            return;
          }
        }
      } else {
        lastProgressRef.current = null;
      }

      // Watchdog de "play travado": se o usuário clicou em play mas o vídeo nunca iniciou (fonte travada sem dados)
      const pending = pendingPlayRef.current;
      if (!pending) return;

      // Caso 1: o play funcionou — vídeo tocando ou avançando o tempo → limpa o registro
      if (engine.state === "playing" && engine.currentTime > 0.5) {
        pendingPlayRef.current = null;
        return;
      }

      // Caso 2: usuário pausou deliberadamente
      if (engine.state === "paused") {
        pendingPlayRef.current = null;
        return;
      }

      // Caso 3: timeout de 6 segundos sem sair do lugar → fonte ruim, troca de servidor (A3 circular)
      if (Date.now() - pending.clickedAt > 6000 && engine.state !== "playing") {
        pendingPlayRef.current = null;
        if (rawStream) {
          recordFailedSource(rawStream.url);
          autoSwitchCountRef.current++;
          if (autoSwitchCountRef.current <= orderedStreams.length * 2) {
            setAutoSwitchMsg("Trocando de servidor…");
            chooseNextApprovedSource();
setTimeout(() => setAutoSwitchMsg(null), 1200);
          }
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [engine.state, engine.currentTime, engine.buffered, rawStream, orderedStreams.length, chooseNextApprovedSource]);

  const handleVideoClick = () => {
    if (engine.muted) {
      engine.setMuted(false);
    }
    if (engine.state === "playing") {
      engine.pause();
    } else {
      handlePlay();
    }
    showControls();
  };

  // Seek para posição inicial
  useEffect(() => {
    if (!hasSeekedToInitial && engine.duration > 0 && initialTime > 0) {
      engine.seek(initialTime);
      setHasSeekedToInitial(true);
    }
  }, [engine.duration, hasSeekedToInitial, initialTime]);

  // Notifica posição para persistência
  useEffect(() => {
    onTimeUpdate?.(engine.currentTime, engine.duration);
  }, [engine.currentTime, engine.duration, onTimeUpdate]);

  // Auto-hide controles
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (engine.state === "playing") {
      hideTimer.current = setTimeout(() => setControlsVisible(false), 3000);
    }
  }, [engine.state]);

  useEffect(() => {
    if (engine.state !== "playing") setControlsVisible(true);
  }, [engine.state]);

  // Fullscreen listener cross-browser (incluindo iOS Safari)
  useEffect(() => {
    const handler = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element;
        mozFullScreenElement?: Element;
        msFullscreenElement?: Element;
      };
      const v = videoRef.current as (HTMLVideoElement & { webkitDisplayingFullscreen?: boolean }) | null;
      setIsFullscreen(
        !!(
          doc.fullscreenElement ||
          doc.webkitFullscreenElement ||
          doc.mozFullScreenElement ||
          doc.msFullscreenElement ||
          v?.webkitDisplayingFullscreen
        )
      );
    };

    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);

    const v = videoRef.current;
    const onBegin = () => setIsFullscreen(true);
    const onEnd = () => setIsFullscreen(false);

    if (v) {
      v.addEventListener("webkitbeginfullscreen", onBegin);
      v.addEventListener("webkitendfullscreen", onEnd);
    }

    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
      if (v) {
        v.removeEventListener("webkitbeginfullscreen", onBegin);
        v.removeEventListener("webkitendfullscreen", onEnd);
      }
    };
  }, []);

  // Atalhos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement?.tagName !== "BODY") return;
      if (e.key === " " || e.key === "k") { e.preventDefault(); engine.state === "playing" ? engine.pause() : handlePlay(); }
      if (e.key === "ArrowRight") { e.preventDefault(); engine.seek(engine.currentTime + 10); }
      if (e.key === "ArrowLeft") { e.preventDefault(); engine.seek(engine.currentTime - 10); }
      if (e.key === "m") engine.setMuted(!engine.muted);
      if (e.key === "f") engine.requestFullscreen();
      showControls();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [engine, handlePlay]);

  const measureAndImproveQuality = useCallback(() => {
    updateVideoResolution();
    const video = videoRef.current;
    const source = orderedStreams[sourceIndex];
    if (!video || !source || video.videoHeight <= 0) return;
    const height = video.videoHeight;
    measuredHeightsRef.current.set(source.url, height);
    if (!metadataFirstSeenRef.current.has(source.url)) {
      metadataFirstSeenRef.current.set(source.url, Date.now());
    }
    // HLS starts at a lower adaptive bitrate on purpose. Allow its ABR engine
    // to ramp up before deciding the actual delivered image is low quality.
    const adaptive = source.format === "hls" || /\\.m3u8(?:$|\\?)/i.test(source.url);
    const firstSeen = metadataFirstSeenRef.current.get(source.url) || Date.now();
    if (adaptive && Date.now() - firstSeen < 9000) return;

    if (manualSelectionRef.current || height >= 700 || qualitySwitchesRef.current >= 3) return;
    if (rejectedDuringPlaybackRef.current.has(source.url)) return;

    const next = nextVodSourceIndex(orderedStreams, sourceIndex, rejectedDuringPlaybackRef.current, {
      preferredAudio, observedHeights: measuredHeightsRef.current,
      failedUrls: getFailedUrls(),
    });
    if (next < 0) return;
    const candidate = orderedStreams[next];
    if (!candidate) return;
    const claimedHeight = advertisedVodResolution(candidate);
    if (source.audio === "dub" && candidate.audio !== "dub") return;
    // Try a declared HD alternative, or an unverified one if the actual
    // current video is clearly soft. Never switch to known lower resolution.
    if (claimedHeight !== null && claimedHeight <= height) return;
    qualitySwitchesRef.current += 1;
    rejectedDuringPlaybackRef.current.add(source.url);
    setAutoSwitchMsg("Buscando imagem de melhor qualidade…");
    setSourceIndex(next);
    setAttemptStage(0);
    setResolvedDirectUrl(null);
    setResolvedIsHls(null);
    setDetectedQuality(null);
  }, [orderedStreams, sourceIndex, preferredAudio, updateVideoResolution]);

  useEffect(() => {
    if (engine.state !== "playing") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") measureAndImproveQuality();
    }, 5500);
    return () => window.clearInterval(timer);
  }, [engine.state, measureAndImproveQuality]);

  // Also reconsider the choice if a verified HD alternative arrives after a
  // low-resolution stream was already accepted from the initial catalogue.
  useEffect(() => {
    const active = orderedStreams[sourceIndex];
    if (!active || manualSelectionRef.current || qualitySwitchesRef.current >= 3) return;
    const actualHeight = measuredHeightsRef.current.get(active.url);
    if (!actualHeight || actualHeight >= 700) return;
    const next = nextVodSourceIndex(orderedStreams, sourceIndex, rejectedDuringPlaybackRef.current, {
      preferredAudio, observedHeights: measuredHeightsRef.current,
      failedUrls: getFailedUrls(),
    });
    const candidate = next < 0 ? null : orderedStreams[next];
    if (!candidate || (advertisedVodResolution(candidate) || 720) <= actualHeight) return;
    if (active.audio === "dub" && candidate.audio !== "dub") return;
    qualitySwitchesRef.current += 1;
    rejectedDuringPlaybackRef.current.add(active.url);
    setSourceIndex(next);
    setAttemptStage(0);
    setResolvedDirectUrl(null);
    setResolvedIsHls(null);
    setDetectedQuality(null);
    setAutoSwitchMsg("Buscando imagem de melhor qualidade…");
  }, [orderedStreams, sourceIndex, preferredAudio]);

  const sources = orderedStreams.map((s, i) => {
    let cleanName = (s.name || `Servidor ${i + 1}`).replace(/\s*\((?:dub|leg)[a-z]*\)$/i, "").trim();
    if (!cleanName) cleanName = `Servidor ${i + 1}`;
    const fmt = s.format || (s.url.includes(".mp4") ? "mp4" : s.url.includes(".m3u8") ? "hls" : undefined);
    return {
      name: cleanName,
      audio: s.audio,
      quality: s.quality,
      format: fmt,
    };
  });

  const handleSourceChange = (i: number) => {
    const prevTime = videoRef.current?.currentTime ?? 0;
    pendingPlayRef.current = null;
    lastProgressRef.current = null;
    autoSwitchCountRef.current = 0;
    manualSelectionRef.current = true;
    rejectedDuringPlaybackRef.current.clear();
    qualitySwitchesRef.current = 0;
    setSourceIndex(i);
    setAttemptStage(0);
    setResolvedDirectUrl(null);
    setResolvedIsHls(null);
    setDetectedQuality(null);
    if (sources[i]?.audio === "dub" || sources[i]?.audio === "leg") {
      setPreferredAudio(sources[i].audio as "dub" | "leg");
    }
    setAutoSwitchMsg(null);
    setTimeout(() => {
      if (videoRef.current && prevTime > 0) {
        videoRef.current.currentTime = prevTime;
      }
    }, 300);
  };

  const handleOverlayClick = () => {
    if (engine.state !== "playing") {
      handleVideoClick();
      return;
    }
    if (!controlsVisible) {
      showControls();
      return;
    }
    handleVideoClick();
  };

  return (
    <div
      ref={containerRef}
      className="ydo-player-container"
      data-controls-visible={controlsVisible}
      onMouseMove={showControls}
      onTouchStart={showControls}
      style={{ cursor: controlsVisible ? "default" : "none" }}
    >
      <video
        ref={videoRef}
        className="ydo-player-video"
        poster={poster}
        playsInline
        // @ts-expect-error atributos nativos de compatibilidade mobile & AirPlay
        webkit-playsinline="true"
        x-webkit-airplay="allow"
        disableRemotePlayback={false}
        preload="metadata"
        aria-label={title ?? "Vídeo"}
        onClick={handleOverlayClick}
        onLoadedMetadata={measureAndImproveQuality}
        onCanPlay={measureAndImproveQuality}
        style={{
          opacity: enhancer.active ? 0 : 1,
          transition: "opacity 0.25s ease-in-out",
        }}
      />

      {/* Canvas WebGL2 para Upscaling HQ com nitidez adaptativa */}
      <canvas
        ref={canvasRef}
        className={`ydo-hq-canvas ${enhancer.active ? "active" : ""}`}
        aria-hidden="true"
      />

      {/* Clique na tela inteira do vídeo para Play/Pause ou revelar controles no mobile */}
      <div
        className="ydo-player-click-capture"
        onClick={handleOverlayClick}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 5,
        }}
      />

      {/* Botão Central de Play Grande quando Pausado ou Pronto */}
      {(engine.state === "paused" || engine.state === "ready") && (
        <button
          onClick={handleVideoClick}
          aria-label="Reproduzir"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 15,
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            backgroundColor: "rgba(232, 180, 74, 0.9)",
            color: "#0a0b14",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 0 35px rgba(232, 180, 74, 0.6)",
            transition: "transform 0.2s, background-color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "translate(-50%, -50%) scale(1)")}
        >
          <Play size={36} fill="currentColor" style={{ marginLeft: "4px" }} />
        </button>
      )}

      {/* Aviso de Troca Automática de Fonte */}
      {autoSwitchMsg && (
        <div
          style={{
            position: "absolute",
            top: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 30,
            backgroundColor: "rgba(10, 11, 20, 0.9)",
            border: "1px solid rgba(232, 180, 74, 0.5)",
            color: "#ffffff",
            padding: "8px 18px",
            borderRadius: "999px",
            fontSize: "0.85rem",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
          }}
        >
          <RefreshCw size={14} className="animate-spin" style={{ color: "#e8b44a" }} />
          <span>{autoSwitchMsg}</span>
        </div>
      )}

      {/* Aviso de HQ Desativado por Desempenho */}
      {hqNotice && (
        <div
          style={{
            position: "absolute",
            top: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 30,
            backgroundColor: "rgba(10, 11, 20, 0.92)",
            border: "1px solid rgba(232, 180, 74, 0.5)",
            color: "#ffffff",
            padding: "8px 18px",
            borderRadius: "999px",
            fontSize: "0.85rem",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
          }}
        >
          <Sparkles size={14} style={{ color: "#e8b44a" }} />
          <span>{hqNotice}</span>
        </div>
      )}

      {/* Alerta de Áudio Mutado pelo Navegador */}
      {engine.muted && engine.state === "playing" && (
        <button
          onClick={() => engine.setMuted(false)}
          style={{
            position: "absolute",
            bottom: "90px",
            left: "24px",
            zIndex: 25,
            backgroundColor: "rgba(232, 180, 74, 0.95)",
            color: "#0a0b14",
            border: "none",
            padding: "8px 16px",
            borderRadius: "999px",
            fontSize: "0.825rem",
            fontWeight: "800",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
          }}
        >
          <Volume2 size={16} />
          <span>Clique para ativar áudio</span>
        </button>
      )}

      {/* Barra de Topo do Player (Estilo Netflix / Saimo TV) */}
      <div className={`ydo-player-topbar${controlsVisible ? " visible" : ""}`}>
        {onBack && (
          <button
            onClick={onBack}
            className="ydo-player-back-btn"
            aria-label="Voltar"
          >
            <ArrowLeft size={22} />
          </button>
        )}
        <div className="ydo-player-top-info">
          {title && <span className="ydo-player-top-title">{title}</span>}
          {subtitle && <span className="ydo-player-top-sub">{subtitle}</span>}
        </div>
      </div>

      {/* Never play a source positively identified as cinema capture or betting-ad media. */}
      {orderedStreams.length === 0 && (
        <div className="ydo-player-overlay ydo-player-error-overlay">
          <AlertCircle size={38} aria-hidden style={{color:"#e8b44a"}} />
          <h3>Sem servidor de qualidade verificada disponível</h3>
          <p>Não encontramos fontes adequadas para esta reprodução agora.</p>
          {onBack && <button className="ydo-btn-secondary" onClick={onBack}>Voltar</button>}
        </div>
      )}
      {/* Loading */}
      {engine.state === "loading" && (
        <div className="ydo-player-overlay" aria-live="polite">
          <div className="ydo-player-spinner" />
          <span>Preparando reprodução…</span>
        </div>
      )}

      {/* Erro após esgotar todas as fontes */}
      {engine.state === "error" && (
        <div className="ydo-player-overlay ydo-player-error-overlay">
          <AlertCircle size={44} aria-hidden style={{ color: "#e8b44a" }} />
          <h3 style={{ fontSize: "1.2rem", fontWeight: "800", margin: "12px 0 6px", color: "#fff" }}>
            Nenhum servidor conseguiu reproduzir este título agora
          </h3>
          <p style={{ color: "rgba(255, 255, 255, 0.7)", maxWidth: "460px", margin: "0 auto 18px", fontSize: "0.95rem" }}>
            Tentamos todas as fontes disponíveis no momento. Tente novamente em instantes.
          </p>
          <div className="ydo-player-error-actions">
            <button
              className="ydo-btn-primary"
              onClick={() => {
                clearAllPlayerCaches();
                stage0FailedRelays.clear();
                pendingPlayRef.current = null;
                lastProgressRef.current = null;
                autoSwitchCountRef.current = 0;
                manualSelectionRef.current = false;
                rejectedDuringPlaybackRef.current.clear();
                measuredHeightsRef.current.clear();
                qualitySwitchesRef.current = 0;
                setSourceIndex(pickBestSourceIndex(orderedStreams, "dub"));
                setAttemptStage(0);
                setResolvedDirectUrl(null);
                setResolvedIsHls(null);
                setAutoSwitchMsg(null);
              }}
            >
              <RefreshCw size={16} /> Limpar Cache e Tentar Novamente
            </button>
            {onBack && (
              <button
                className="ydo-btn-secondary"
                onClick={onBack}
              >
                Voltar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Controles */}
      <div className={`ydo-controls-wrapper${controlsVisible ? " visible" : ""}`}>
        {title && <div className="ydo-player-title">{title}</div>}
        <PlayerControls
          state={engine.state}
          currentTime={engine.currentTime}
          duration={engine.duration}
          buffered={engine.buffered}
          volume={engine.volume}
          muted={engine.muted}
          playbackRate={engine.playbackRate}
          isFullscreen={isFullscreen}
          sources={sources}
          currentSourceIndex={sourceIndex}
          detectedQuality={detectedQuality || sources[sourceIndex]?.quality || "Auto"}
          onPlay={handlePlay}
          onPause={engine.pause}
          onSeek={engine.seek}
          onVolume={engine.setVolume}
          onMute={() => engine.setMuted(!engine.muted)}
          onFullscreen={engine.requestFullscreen}
          onPiP={() => void engine.requestPiP()}
          onRate={engine.setPlaybackRate}
          onSourceChange={handleSourceChange}
          onCast={engine.castToTv}
          hqSupported={enhancer.supported}
          hqActive={hqEnabled}
          onToggleHq={toggleHq}
        />
      </div>
    </div>
  );
}
