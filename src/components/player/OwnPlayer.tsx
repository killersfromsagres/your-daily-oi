"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, RefreshCw, ArrowLeft, Play, Volume2, ScanLine, SkipForward } from "lucide-react";
import { usePlayerEngine, isRelaySource } from "./usePlayerEngine";
import { useVideoEnhancer } from "./useVideoEnhancer";
import { useNeuralVideoUpscaler } from "./useNeuralVideoUpscaler";
import { selectHqBackend } from "@/lib/hq-playback-policy";
import { chooseHqProcessing } from "@/lib/hq-render-policy";
import { usePlayerFullscreen } from "./usePlayerFullscreen";
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
import { bestVodSourceIndex, playableVodSources, nextVodSourceIndex, advertisedVodResolution, betterMeasuredVodSourceIndex } from "@/lib/vod-source-quality";
import { shouldChangeServerOnStartup } from "@/lib/playback-start";
import { dubbedVodSources } from "@/lib/dubbed-audio";

// Cache negativo de sessão para estágio 0 (HLS probe) do relay Saimo
const stage0FailedRelays = new Map<string, number>();
const RELAY_FAILURE_TTL_MS = 90_000;

interface OwnPlayerProps {
  streams: StreamSource[];
  poster?: string | undefined;
  title?: string | undefined;
  subtitle?: string | undefined;
  onBack?: () => void | undefined;
  initialTime?: number | undefined;
  onTimeUpdate?: (t: number, duration?: number) => void | undefined;
  onEnded?: () => void | undefined;
  preferredAudio?: "dub" | "leg" | undefined;
  expectedRuntimeMin?: number | undefined;
  contentType?: "movie" | "series" | "anime" | undefined;
  onNextEpisode?: () => void | undefined;
  nextEpisodeLabel?: string | undefined;
  openingEndSeconds?: number | undefined;
  openingStartSeconds?: number | undefined;
  creditsStartSeconds?: number | undefined;
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
  const clean = (url.split("?")[0]||"").toLowerCase();
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
  contentType = "movie",
  onNextEpisode,
  nextEpisodeLabel,
  openingEndSeconds,
  openingStartSeconds = 0,
  creditsStartSeconds,
}: OwnPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the active source at the same index while asynchronous provider
  // results arrive. Reordering an in-use index previously swapped the playing
  // URL under the video element and caused unexpected playback restarts.
  const stableSourcesRef = useRef<StreamSource[]>([]);
  const orderedStreams = useMemo(() => {
    const candidates = sortStreamsByHealth(dubbedVodSources(playableVodSources(streams)));
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
  const {isFullscreen,theaterFullscreen,rotateLandscapeFallback,toggle:toggleFullscreen}=usePlayerFullscreen(containerRef,videoRef);
  const [hasSeekedToInitial, setHasSeekedToInitial] = useState(false);
  const [autoSwitchMsg, setAutoSwitchMsg] = useState<string | null>(null);
  const [exhaustedSources, setExhaustedSources] = useState(false);
  const [detectedQuality, setDetectedQuality] = useState<string | null>(null);
  const autoSwitchCountRef = useRef(0);
  const rejectedDuringPlaybackRef = useRef(new Set<string>());
  const measuredHeightsRef = useRef(new Map<string,number>());
  const metadataFirstSeenRef = useRef(new Map<string,number>());
  const manualSelectionRef = useRef(false);
  const qualitySwitchesRef = useRef(0);
  const hasEverPlayedRef = useRef(false);
  const pendingPlayRef = useRef<{ clickedAt: number } | null>(null);
  const pausedByUserRef = useRef(false);
  const startupRef = useRef<{ url: string; stage: number; startedAt: number }>({url:"",stage:0,startedAt:0});
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
    if (next < 0) {
      setExhaustedSources(true);
      return false;
    }
    setExhaustedSources(false);
    pausedByUserRef.current = false;
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

  // Genuine WebGPU neural 2× super-resolution (trained Anime4K CNN);
  // keep legacy WebGL HQ only as an explicit, correctly named fallback.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const neuralCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hqEnabled, setHqEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("zangflix:ai-upscale") === "true"; }
    catch { return false; }
  });
  const [hqNotice, setHqNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!hqNotice) return;
    const timeout = window.setTimeout(() => setHqNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [hqNotice]);
  const [webglFailed, setWebglFailed] = useState(false);
  const [hqSourceSize, setHqSourceSize] = useState({ width: 0, height: 0 });
  const hqDevice = useMemo(() => {
    if (typeof navigator === "undefined") return {
      mobile: true, logicalCores: 2, memoryGb: 4, webgpu: false,
    };
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      window.matchMedia("(pointer: coarse)").matches;
    return {
      mobile,
      logicalCores: navigator.hardwareConcurrency || 2,
      memoryGb: (navigator as Navigator & {deviceMemory?: number}).deviceMemory || 4,
      webgpu: "gpu" in navigator,
    };
  }, []);
  const hqStrategy = chooseHqProcessing({ ...hqDevice, ...hqSourceSize });

  // Failure of an optional renderer must NEVER change the user's HQ setting,
  // permanently disable HQ or stop audio/video. Restore native compositing.
  const handleHqDowngrade = useCallback(() => {
    setWebglFailed(true);
    setHqNotice("HQ: esta fonte bloqueia o processamento por GPU ou excedeu o limite de desempenho. Ajuste visual leve aplicado.");
  }, []);

  // Opt-in compact inference on capable devices; live throughput is checked
  // before the enhanced layer can replace native playback.
  const neuralWanted = hqEnabled && hqStrategy === "neural";
  const neural = useNeuralVideoUpscaler(videoRef, neuralCanvasRef, neuralWanted, contentType);
  const enhancer = useVideoEnhancer(
    videoRef, canvasRef,
    hqEnabled && !webglFailed &&
      (hqStrategy === "webgl" || (hqStrategy === "neural" && neural.status === "unavailable")),
    handleHqDowngrade
  );
  const hqBackend = selectHqBackend({
    requested: hqEnabled,
    neuralActive: neural.active,
    neuralUnavailable: hqStrategy !== "neural" || neural.status === "unavailable",
    webglActive: enhancer.active,
    webglSupported: hqStrategy !== "native" && enhancer.supported,
    webglFailed: webglFailed || hqStrategy === "native",
  });
  const enhancedActive = hqBackend === "neural" || hqBackend === "webgl";
  // Native compositor fallback improves tones modestly. It cannot create
  // missing pixels when CORS or the browser blocks both GPU rendering paths.
  const nativeHqFallback = hqEnabled && !enhancedActive;
  useEffect(() => {
    if (!hqEnabled || !neuralWanted || neural.status !== "unavailable") return;
    setHqNotice((neural.reason || "A IA não está disponível nesta fonte") +
      " · usando HQ compatível");
    const noticeTimer = setTimeout(() => setHqNotice(null), 5000);
    return () => clearTimeout(noticeTimer);
  }, [hqEnabled, neuralWanted, neural.status, neural.reason]);

  const toggleHq = useCallback(() => {
    const next = !hqEnabled;
    setHqEnabled(next);
    if (next) {
      const video=videoRef.current;
      if(video?.videoWidth&&video.videoHeight)setHqSourceSize({width:video.videoWidth,height:video.videoHeight});
      setWebglFailed(false); // Retry on demand, never restart the video.
      setHqNotice("HQ ligado · preparando melhoria de imagem…");
    } else {
      setHqNotice(null);
    }
    try { localStorage.setItem("zangflix:ai-upscale", String(next)); } catch {}
  }, [hqEnabled, hqStrategy]);

  const updateVideoResolution = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const h = v.videoHeight;
    const w = v.videoWidth;
    if (w > 0 && h > 0) {
      setHqSourceSize(prev => prev.width === w && prev.height === h
        ? prev : {width: w, height: h});
    }
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
  useEffect(()=>{
    setWebglFailed(false);
    setHqSourceSize({width:0,height:0});
  },[rawStream?.url]);

  // Track every attempt from the moment the browser receives the source,
  // including autoplay before anyone presses Play.
  useEffect(() => {
    if (!rawStream) return;
    startupRef.current = {url:rawStream.url,stage:attemptStage,startedAt:Date.now()};
    pendingPlayRef.current = null;
    lastProgressRef.current = null;
    setExhaustedSources(false);
  }, [rawStream?.url, attemptStage]);

  const recoverUnstartedSource = useCallback((): boolean => {
    if (!rawStream) return false;
    const first = getStreamUrlForStage(rawStream.url,0,rawStream.format);
    const alternate = getStreamUrlForStage(rawStream.url,1,rawStream.format);
    if (attemptStage === 0 && alternate !== first) {
      setAutoSwitchMsg("Tentando uma conexão alternativa…");
      setResolvedDirectUrl(null);
      setResolvedIsHls(null);
      setAttemptStage(1);
      return true;
    }
    recordFailedSource(rawStream.url);
    setAutoSwitchMsg("Conectando ao próximo servidor dublado…");
    return chooseNextApprovedSource();
  }, [rawStream, attemptStage, chooseNextApprovedSource]);

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
      format: fmt || "auto",
      url: finalUrl,
    };
  }, [rawStream, attemptStage, isRelay, resolvedDirectUrl, resolvedIsHls]);

  const handleEnded = useCallback(() => {
    onEnded?.();
    onNextEpisode?.();
  }, [onEnded, onNextEpisode]);

  // TDZ SAFE: Declarado antes de qualquer useEffect/handler que o cite
  const engine = usePlayerEngine(videoRef, currentStream, handleEnded, {
    dubbedOnly:true,
    expectedRuntimeMin,
    attemptStage,
    minContentSeconds: contentType === "anime" ? 25 : 45,
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
    return undefined;
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
    pausedByUserRef.current = false;
    pendingPlayRef.current = { clickedAt: Date.now() };
    void engine.play();
  }, [engine]);

  const handlePause = useCallback(() => {
    pausedByUserRef.current = true;
    pendingPlayRef.current = null;
    engine.pause();
  }, [engine]);

  // When the first source never starts, automatically attempt its alternate
  // transport and then the best remaining dubbed server. This is independent
  // of user input; browser autoplay policy blocks are handled separately.
  // Watchdog de "play travado" e "congelamento mid-play" (A5)
  useEffect(() => {
    const id = setInterval(() => {
      if (rawStream && !exhaustedSources && engine.state !== "error") {
        const attempt = startupRef.current;
        const elapsed = Date.now() - attempt.startedAt;
        const playing = engine.state === "playing" && !videoRef.current?.paused;
        if (attempt.url === rawStream.url && attempt.stage === attemptStage &&
            shouldChangeServerOnStartup(elapsed, playing, engine.needsUserGesture, pausedByUserRef.current, 11_000)) {
          // Avoid duplicate recovery from a running interval before React
          // applies the next source/stage.
          startupRef.current.startedAt = Date.now();
          autoSwitchCountRef.current++;
          if (autoSwitchCountRef.current <= Math.max(2, orderedStreams.length * 3)) {
            recoverUnstartedSource();
          } else {
            setExhaustedSources(true);
          }
          return;
        }
      }
      // Detect stalls using the media element, not React's last rendered time.
      // Browsers can transition from "playing" to "waiting"/"stalled" while
      // retaining buffered data that is no longer decodable.
      const media = videoRef.current;
      if (hasEverPlayedRef.current && media && !media.paused && !media.ended &&
          !media.seeking && !pausedByUserRef.current &&
          document.visibilityState !== "hidden") {
        const now = Date.now();
        const position = media.currentTime;
        if (!lastProgressRef.current || Math.abs(position - lastProgressRef.current.time) > 0.25) {
          lastProgressRef.current = { time: position, at: now };
        } else if (now - lastProgressRef.current.at > 18000) {
          const remaining = Number.isFinite(media.duration) ? media.duration - position : Infinity;
          // Never fail over when playback has naturally reached the end.
          if (remaining > 3 && media.playbackRate > 0) {
            console.warn("[OwnPlayer] Playback stopped progressing; attempting next source.");
            lastTimeRef.current = Math.max(lastTimeRef.current, position);
            lastProgressRef.current = { time: position, at: now };
            if (rawStream) {
              autoSwitchCountRef.current++;
              if (autoSwitchCountRef.current <= Math.max(2, orderedStreams.length * 2)) {
                setAutoSwitchMsg("Recuperando reprodução…");
                // Retry the same provider through its alternate transport first.
                // Only blacklist the provider after both transports have failed.
                const first = getStreamUrlForStage(rawStream.url, 0, rawStream.format);
                const alternate = getStreamUrlForStage(rawStream.url, 1, rawStream.format);
                if (attemptStage === 0 && alternate !== first) {
                  setResolvedDirectUrl(null);
                  setResolvedIsHls(null);
                  setAttemptStage(1);
                } else {
                  recordFailedSource(rawStream.url);
                  if (!chooseNextApprovedSource()) {
                    // No usable source remains; do not toggle stage forever.
                    setExhaustedSources(true);
                  }
                }
              } else {
                setExhaustedSources(true);
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
      if (engine.needsUserGesture || pausedByUserRef.current) { pendingPlayRef.current = null; return; }

      // Caso 1: o play funcionou — vídeo tocando ou avançando o tempo → limpa o registro
      if (engine.state === "playing" && engine.currentTime > 0.5) {
        pendingPlayRef.current = null;
        return;
      }

      // An explicit Play click can be pending while the previous state is
      // still "paused". The pending intent must not be discarded here.
      // Caso 2: timeout sem progresso -> próxima fonte.
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
  }, [engine.state, engine.currentTime, engine.buffered, engine.needsUserGesture, rawStream, orderedStreams.length, attemptStage, chooseNextApprovedSource, exhaustedSources, recoverUnstartedSource]);

  const handleVideoClick = () => {
    if (engine.muted) {
      engine.setMuted(false);
    }
    if (engine.state === "playing") {
      handlePause();
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

  // Persist the actual video position on app background/close, not stale React state.
  useEffect(() => {
    const persist = () => {
      const video = videoRef.current;
      if (video && Number.isFinite(video.currentTime) && video.currentTime > 2) {
        onTimeUpdate?.(video.currentTime, Number.isFinite(video.duration) ? video.duration : 0);
      }
    };
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", persist);
    return () => {
      persist();
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", persist);
    };
  }, [onTimeUpdate]);

  // Android media notification: override the browser/provider fallback artwork.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title: title || "ZANG FLIX",
      artist: subtitle || "Reproduzindo no ZANG FLIX",
      album: "ZANG FLIX",
      artwork: [
        { src: new URL("/favicon.svg", window.location.origin).href, sizes: "any", type: "image/svg+xml" },
        { src: new URL("/logo.png", window.location.origin).href, sizes: "512x512", type: "image/png" },
      ],
    });
    return () => {
      // Avoid clearing metadata belonging to the next route's player.
      if (session.metadata?.title === (title || "ZANG FLIX")) session.metadata = null;
    };
  }, [title, subtitle]);

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

  // Atalhos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement?.tagName !== "BODY") return;
      if (e.key === " " || e.key === "k") { e.preventDefault(); engine.state === "playing" ? handlePause() : handlePlay(); }
      if (e.key === "ArrowRight") { e.preventDefault(); engine.seek(engine.currentTime + 10); }
      if (e.key === "ArrowLeft") { e.preventDefault(); engine.seek(engine.currentTime - 10); }
      if (e.key === "m") engine.setMuted(!engine.muted);
      if (e.key === "f") toggleFullscreen();
      showControls();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [engine, handlePlay, handlePause, toggleFullscreen]);

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
    const adaptive = isHlsStream(source.url, source.format);
    const firstSeen = metadataFirstSeenRef.current.get(source.url) || Date.now();
    if (adaptive && Date.now() - firstSeen < 9000) return;

    if(manualSelectionRef.current)return;
    const betterMeasured=betterMeasuredVodSourceIndex(orderedStreams,sourceIndex,measuredHeightsRef.current,getFailedUrls());
    if(betterMeasured>=0){
      qualitySwitchesRef.current+=1;
      rejectedDuringPlaybackRef.current.add(source.url);
      rejectedDuringPlaybackRef.current.delete(orderedStreams[betterMeasured]!.url);
      setSourceIndex(betterMeasured);setAttemptStage(0);
      setResolvedDirectUrl(null);setResolvedIsHls(null);setDetectedQuality(null);
      setAutoSwitchMsg("Restaurando a melhor imagem dublada verificada…");
      return;
    }
    if (height >= 2160 || qualitySwitchesRef.current >= 3) return;
    if (rejectedDuringPlaybackRef.current.has(source.url)) return;

    const next = nextVodSourceIndex(orderedStreams, sourceIndex, rejectedDuringPlaybackRef.current, {
      preferredAudio, observedHeights: measuredHeightsRef.current,
      failedUrls: getFailedUrls(),
    });
    if (next < 0) return;
    const candidate = orderedStreams[next];
    if (!candidate) return;
    const claimedHeight = measuredHeightsRef.current.get(candidate.url) || advertisedVodResolution(candidate);
    if (height >= 700 && claimedHeight === null) return;
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
    if (!actualHeight || actualHeight >= 2160) return;
    const next = nextVodSourceIndex(orderedStreams, sourceIndex, rejectedDuringPlaybackRef.current, {
      preferredAudio, observedHeights: measuredHeightsRef.current,
      failedUrls: getFailedUrls(),
    });
    const candidate = next < 0 ? null : orderedStreams[next];
    if (actualHeight >= 700 && candidate && advertisedVodResolution(candidate) === null) return;
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
      ...(s.quality ? {quality:s.quality} : {}),
      format: fmt || "auto",
    };
  });

  const handleSourceChange = (i: number) => {
    const prevTime = videoRef.current?.currentTime ?? 0;
    pendingPlayRef.current = null;
    lastProgressRef.current = null;
    autoSwitchCountRef.current = 0;
    manualSelectionRef.current = true;
    pausedByUserRef.current = false;
    rejectedDuringPlaybackRef.current.clear();
    qualitySwitchesRef.current = 0;
    setSourceIndex(i);
    setExhaustedSources(false);
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
      className={"ydo-player-container"+(theaterFullscreen?" is-theater":"")+(rotateLandscapeFallback?" is-landscape-fallback":"")}
      data-controls-visible={controlsVisible}
      onMouseMove={showControls}
      onTouchStart={showControls}
      style={{ cursor: controlsVisible ? "default" : "none" }}
    >
      <div className="zf-fullscreen-surface">
      <div className="zf-player-watermark" aria-hidden="true">
        ZANG <span>FLIX</span>
      </div>
            {contentType === "anime" && openingEndSeconds && Number.isFinite(openingEndSeconds) &&
        engine.currentTime >= Math.max(0, openingStartSeconds - 2) && engine.currentTime < openingEndSeconds - 3 && (
        <button type="button" className="zf-player-episode-action zf-skip-opening"
          onClick={() => { engine.seek(openingEndSeconds); showControls(); }}>
          <SkipForward size={17} /> Pular abertura
        </button>
      )}
      {onNextEpisode && engine.duration > 0 &&
        engine.currentTime >= (creditsStartSeconds !== undefined && Number.isFinite(creditsStartSeconds)
          ? creditsStartSeconds + 1 : Math.max(0, engine.duration - 180)) &&
        engine.duration - engine.currentTime > 0 && (
        <button type="button" className="zf-player-episode-action zf-next-episode"
          style={{ zIndex: 999, pointerEvents: "auto" }}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => { event.preventDefault(); event.stopPropagation(); onNextEpisode(); }}>
          <SkipForward size={17} /> {nextEpisodeLabel || "Próximo episódio"}
        </button>
      )}
      <video
        ref={videoRef}
        className="ydo-player-video"
        poster={poster}
        playsInline
        // Native compatibility attributes for mobile and AirPlay
        webkit-playsinline="true"
        x-webkit-airplay="allow"
        disableRemotePlayback={false}
        preload="metadata"
        aria-label={title ?? "Vídeo"}
        onClick={handleOverlayClick}
        onLoadedMetadata={measureAndImproveQuality}
        onCanPlay={measureAndImproveQuality}
        onResize={measureAndImproveQuality}
        style={{
          opacity: enhancedActive ? 0 : 1,
          // Hardware-accelerated color tuning: zero extra frame copies.
          // The light WebGL pass supplies edge sharpening on capable PCs.
          filter: nativeHqFallback ? "contrast(1.025) saturate(1.025)" : "none",
          transition: "opacity 0.25s ease-in-out, filter 0.2s ease-in-out",
        }}
      />

      {/* Neural canvas is shown only after the first successfully inferred WebGPU frame. */}
      <canvas
        ref={neuralCanvasRef}
        className={`ydo-hq-canvas ydo-ai-canvas ${neural.active ? "active" : ""}`}
        aria-hidden="true"
      />

      {/* WebGL2 HQ is a non-neural fallback on unsupported devices or sources. */}
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
          <ScanLine size={14} style={{ color: "#e8b44a" }} />
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

      {/* Barra superior do player ZANG FLIX */}
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
          <h3>Dublagem indisponível no momento</h3>
          <p>Não encontramos uma fonte dublada adequada para este título. Tente novamente mais tarde.</p>
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

      {/* Falhas durante o failover não mostram um Play inerte. */}
      {engine.state === "error" && !exhaustedSources && rawStream && (
        <div className="ydo-player-overlay" role="status" aria-live="polite">
          <div className="ydo-player-spinner" />
          <span>Buscando outro servidor para iniciar o vídeo…</span>
        </div>
      )}

      {/* Erro somente quando não restam servidores utilizáveis. */}
      {exhaustedSources && (
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
                pausedByUserRef.current = false;
                rejectedDuringPlaybackRef.current.clear();
                measuredHeightsRef.current.clear();
                qualitySwitchesRef.current = 0;
                setExhaustedSources(false);
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
          rotatedLandscape={rotateLandscapeFallback}
          sources={sources}
          currentSourceIndex={sourceIndex}
          detectedQuality={detectedQuality || sources[sourceIndex]?.quality || "Auto"}
          onPlay={handlePlay}
          onPause={handlePause}
          onSeek={engine.seek}
          onVolume={engine.setVolume}
          onMute={() => engine.setMuted(!engine.muted)}
          onFullscreen={toggleFullscreen}
          onPiP={() => void engine.requestPiP()}
          onRate={engine.setPlaybackRate}
          onSourceChange={handleSourceChange}
          onCast={engine.castToTv}
          hqSupported={true}
          hqActive={hqEnabled}
          hqMode={hqBackend === "waiting" ? "loading" : hqBackend === "neural" ? "ai" : hqBackend === "webgl" ? "shader" : "native"}
          onToggleHq={toggleHq}
        />
      </div>
      </div>
    </div>
  );
}
