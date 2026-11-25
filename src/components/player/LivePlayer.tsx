"use client";
import "@/lib/browser-media";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { CanalTV, FonteTV } from "@/lib/canais";
import { buildLiveProxyPath, classifyLiveSource, liveSourceFingerprint, looksOffline, nextLiveMode, orderLiveSources, type LiveAccessMode, type LiveStreamFormat } from "@/lib/live-source";
import { classifyPicture,createPictureWatchdog,nextPictureSource,rememberPictureSource,forgetPictureSource,prioritizePictureSource,type PictureSample,type PictureFault } from "@/lib/live-picture-health";
import { terminalHlsLoadFailure, accessDeniedLiveSource, probeFailedLiveProxy } from "@/lib/live-http-errors";
import { browserLiveTransport, isBraveBrowser, needsPlaybackGesture, type LiveProxyBackend } from "@/lib/live-browser-compat";
import { shouldTryTvEdgeBackup, tvEdgeBackupUrl } from "@/lib/tv-edge-backup";
import type { ProgramaEPG } from "@/lib/epg";
import { LiveVolumeControl } from "./LiveVolumeControl";
import { useVideoEnhancer } from "./useVideoEnhancer";
import { useNeuralVideoUpscaler } from "./useNeuralVideoUpscaler";
import {isSportsLiveChannel,useSportsDeinterlacer} from "./useSportsDeinterlacer";
import { automaticHqEnabled, visibleLiveHqStatus } from "@/lib/automatic-hq";
import {liveHqBackend,liveHqFilter} from "@/lib/live-hq-policy";
import { LIVE_VOLUME_KEY, clampVolume, stepVolume } from "@/lib/live-volume";
import { CastControl } from "./CastControl";
import { decideLiveCatchup, hlsLatencyOptions, mpegtsLatencyOptions, classifyLivePlaybackStall, nextLiveAutoRetryDelay, preferredLiveLatencyMode, shouldEaseLiveCatchup, type LiveLatencyMode } from "@/lib/live-latency";
import { usePlayerFullscreen } from "./usePlayerFullscreen";
import "@/styles/live-glass-panels.css";
import "@/styles/live-browser-compat.css";
import "@/styles/live-hq-adaptive.css";
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
  Play,
  TvMinimal,
} from "lucide-react";

export interface LivePlayerProps {
  canal: CanalTV;
  epgAtual?: ProgramaEPG;
  onNextCanal?: () => void;
  onPrevCanal?: () => void;
  onToggleGuide?: () => void;
  onLoadingChange?: (loading: boolean) => void;
  onPlaybackStatus?: (id: string, status: "connecting" | "playing" | "unavailable") => void;
  onSourcesExhausted?: () => void;
  /** Older deployments expose /api/live-proxy but not /api/tv/stream. */
  proxyBackend?: "checking" | "catalog" | "legacy" | "unavailable";
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

const LIVE_VOL_KEY = LIVE_VOLUME_KEY;
// A network interruption is not proof of permanent CORS failure. Old
// localStorage blacklists previously forced unrelated channels on the same
// CDN into a broken proxy for days. Keep only a short memory-only cooldown.
const directHostCooldown = new Map<string,number>();
const HOST_RETRY_MS = 90_000;
function hostSemCors(url:string):boolean {
  try {
    const host=new URL(url).hostname.toLowerCase();
    const until=directHostCooldown.get(host)||0;
    if (until<Date.now()) {directHostCooldown.delete(host);return false;}
    return true;
  } catch {return false;}
}
function marcarSemCors(url:string) {
  try {
    const host=new URL(url).hostname.toLowerCase();
    directHostCooldown.set(host,Date.now()+HOST_RETRY_MS);
  } catch {}
}
function limparHostsSemCors() {
  directHostCooldown.clear();
  try {localStorage.removeItem("zangflix:sem-cors");}catch{}
}
const initialModeFor = (
  f: FonteTV | undefined,
  firstParty = false,
  backend: LiveProxyBackend = "catalog",
): LiveAccessMode =>
  browserLiveTransport(f, firstParty, backend, Boolean(f && hostSemCors(f.url)));

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
  onPlaybackStatus,
  onSourcesExhausted,
  proxyBackend = "catalog",
}: LivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hqCanvasRef = useRef<HTMLCanvasElement>(null);
  const neuralCanvasRef = useRef<HTMLCanvasElement>(null);
  const neural4xCanvasRef=useRef<HTMLCanvasElement>(null);
  const deinterlaceCanvasRef=useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsInstanceRef = useRef<{
    destroy: () => void;
    liveSyncPosition?: number | null | undefined;
    engineManagesLatency?: boolean;
    setHq?: (enabled:boolean)=>void;
    setPlaybackSafety?: (enabled:boolean)=>void;
  } | null>(null);
  const shakaInstanceRef = useRef<{ destroy: () => Promise<unknown> | void } | null>(null);
  const attemptedModesRef = useRef<Map<string, Set<LiveAccessMode>>>(new Map());
  const edgeBackupTriedRef = useRef(new Set<string>());
  const accessDeniedSourcesRef = useRef(new Set<string>());
  const handlingFailureRef = useRef(false);
  const pictureTriedRef=useRef(new Set<string>());
  const [pictureReady,setPictureReady]=useState(false);
  const [hqPictureSuppressed,setHqPictureSuppressed]=useState(false);
  const hqPictureSuppressedRef=useRef(false);
  const autoRetryCountRef = useRef(0);
  const stablePlaybackSinceRef = useRef<number | null>(null);
  const everPlayedRef = useRef(false);
  const lastResumeAttemptRef = useRef(0);
  const braveFirstPartyRef = useRef(false);
  const decoderBaselineRef=useRef<{dropped:number;total:number}|null>(null);
  const smoothPlaybackUntilRef=useRef(0);

  // Ordem https-first preservando a ordem curada do catálogo, com suporte total a DASH/ClearKey
  const validStreams = useMemo(() => {
    // Tenta primeiro os espelhos que responderam com mídia no diagnóstico.
    // Os CDNs problemáticos permanecem disponíveis como último recurso.
    const pool = canal.fontes.filter((f) => !looksOffline(f));
    return prioritizePictureSource(canal.id,sortStreamsByHealth(orderLiveSources(pool)),f=>liveSourceFingerprint(f.url));
  }, [canal.id,canal.fontes]);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [braveCompatibility, setBraveCompatibility] = useState(false);
  const [gestureRequired, setGestureRequired] = useState(false);
  const [attemptMode, setAttemptMode] = useState<"direct" | "proxy">(() =>
    initialModeFor(validStreams[0])
  );
  const [playNonce, setPlayNonce] = useState(0);
  const [useLegacyOnMismatch, setUseLegacyOnMismatch] = useState(false);
  const [useEdgeBackup, setUseEdgeBackup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);
  const [error, setError] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const {isFullscreen,theaterFullscreen,rotateLandscapeFallback,toggle:handleFullscreenToggle}=usePlayerFullscreen(containerRef,videoRef);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return 1;
    try{return clampVolume(localStorage.getItem(LIVE_VOL_KEY));}catch{return 1;}
  });
  const [isLiveEdge, setIsLiveEdge] = useState(true);
  // HQ starts automatically on every channel. An explicit previous user
  // choice of "false" is honored after hydration; avoid a server/client
  // markup mismatch from reading localStorage during the initial render.
  const [hqEnabled,setHqEnabled]=useState(true);
  useEffect(()=>{
    let saved:string|null=null;
    try{saved=window.localStorage.getItem("zangflix:tv-hq");}catch{}
    setHqEnabled(automaticHqEnabled(saved));
  },[]);
  const hqEnabledRef=useRef(hqEnabled);
  hqEnabledRef.current=hqEnabled;
  const [webglFailed,setWebglFailed]=useState(false);
  const [hqSourceSize,setHqSourceSize]=useState({width:0,height:0});
  const hqDevice=useMemo(()=>{
    if(typeof navigator==="undefined")return {mobile:true,cores:2,memoryGb:2,reducedMotion:true};
    const mobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (typeof window!=="undefined"&&window.matchMedia("(pointer: coarse)").matches);
    return {mobile,cores:navigator.hardwareConcurrency||2,
      memoryGb:(navigator as Navigator&{deviceMemory?:number}).deviceMemory||4,
      reducedMotion:typeof window!=="undefined"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      webgpu:"gpu" in navigator};
  },[]);
  // Stadium, grass and fast football pans may expose interlaced combing.
  // Motion-gated field reconstruction precedes every GPU HQ path when safe.
  const sportsChannel=isSportsLiveChannel(canal.nome,canal.categoria);
  const pictureHqEnabled=hqEnabled&&pictureReady&&!hqPictureSuppressed;
  const deinterlacer=useSportsDeinterlacer(
    videoRef,deinterlaceCanvasRef,pictureHqEnabled&&sportsChannel);
  const processedInput={
    canvasRef:deinterlaceCanvasRef,active:deinterlacer.active,
  };
  const hqBackend=liveHqBackend({...hqDevice,...hqSourceSize,sports:sportsChannel});
  // The repository has real trained CNN 2× weights, not a native 4× model:
  // two sequential 2× WebGPU passes can provide 4× reconstruction only on
  // small sources and fast desktop GPUs, with immediate 2× fallback.
  const neural4x=useNeuralVideoUpscaler(
    videoRef,neural4xCanvasRef,
    pictureHqEnabled&&hqBackend==="neural-4x","movie","live",4,processedInput);
  const neuralWanted=pictureHqEnabled&&
    (hqBackend==="neural"||
      (hqBackend==="neural-4x"&&neural4x.status==="unavailable"));
  const neural=useNeuralVideoUpscaler(
    videoRef,neuralCanvasRef,neuralWanted,"movie","live",2,processedInput);
  const handleHqDowngrade=useCallback(()=>setWebglFailed(true),[]);
  const spatialWanted=pictureHqEnabled&&!webglFailed&&(
    hqBackend==="spatial"||
    (hqBackend==="neural"&&neural.status==="unavailable")||
    (hqBackend==="neural-4x"&&neural4x.status==="unavailable"&&
      neural.status==="unavailable"));
  const enhancer=useVideoEnhancer(videoRef,hqCanvasRef,
    spatialWanted,handleHqDowngrade,true,processedInput);
  const hqStatus=visibleLiveHqStatus({
    enabled:pictureHqEnabled,neural4xActive:neural4x.active,
    neuralActive:neural.active,
    spatialActive:enhancer.active&&!webglFailed,
    deinterlaceActive:deinterlacer.active,
  });
  const hqActive=pictureHqEnabled&&hqStatus!=="native"&&hqStatus!=="off";
  const hqActiveRef=useRef(false);hqActiveRef.current=hqActive;
  const measureLiveQuality=useCallback(()=>{
    const video=videoRef.current;
    if(!video)return;
    const width=video.videoWidth,height=video.videoHeight;
    setHqSourceSize(previous=>previous.width===width&&previous.height===height
      ?previous:{width,height});
  },[]);
  const toggleHq=useCallback(()=>{
    const next=!hqEnabled;
    setHqEnabled(next);
    if(next){setWebglFailed(false);hqPictureSuppressedRef.current=false;setHqPictureSuppressed(false);}
    try{localStorage.setItem("zangflix:tv-hq",String(next));}catch{}
    measureLiveQuality();
  },[hqEnabled,measureLiveQuality]);
  const [latencyMode, setLatencyMode] = useState<LiveLatencyMode>(() => {
    if (typeof window === "undefined") return "fast";
    let saved: string | null = null;
    try { saved = window.localStorage.getItem("zangflix:live-latency-mode"); } catch {}
    return preferredLiveLatencyMode(canal.categoria, canal.nome, saved);
  });
  const [autoSwitchMsg, setAutoSwitchMsg] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [volumeHardwareOnly,setVolumeHardwareOnly]=useState(false);
  const [volumeOpen,setVolumeOpen]=useState(false);
  const onVolumeDialogChange=useCallback((open:boolean)=>setVolumeOpen(open),[]);
  const volumeRef=useRef(volume);
  const lastAudibleVolume=useRef(volume>0?volume:.6);
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

  // Brave normally uses a Chromium UA, so do not infer it from the UA string.
  // The official Brave API is checked locally; no fingerprint is stored or sent.
  useEffect(() => {
    let mounted = true;
    void isBraveBrowser(navigator).then(isBrave => {
      if (!mounted || !isBrave) return;
      braveFirstPartyRef.current = true;
      setBraveCompatibility(true);
      // Do not tear down a transmission that has already begun working.
      // On an unstarted connection, try the same-origin catalog/proxy first.
      if (!everPlayedRef.current && proxyBackend !== "unavailable" && attemptMode === "direct") {
        attemptedModesRef.current.clear();
        setAttemptMode("proxy");
        setPlayNonce(n => n + 1);
        setAutoSwitchMsg("Brave · tentando conexão pelo ZANG FLIX");
      }
    });
    return () => { mounted = false; };
  }, [proxyBackend]);

  // A persisted manual choice always wins; without one, sports open in
  // the fluid buffer profile and ordinary channels keep the fast default.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("zangflix:live-latency-mode"); } catch {}
    setLatencyMode(preferredLiveLatencyMode(canal.categoria, canal.nome, saved));
  }, [canal.id, canal.categoria, canal.nome]);

  // Reseta ao trocar de canal
  useEffect(() => {
    autoCleanPlayerCache();
    attemptedModesRef.current.clear();
    pictureTriedRef.current.clear();
    hqPictureSuppressedRef.current=false;setHqPictureSuppressed(false);setPictureReady(false);
    edgeBackupTriedRef.current.clear();
    accessDeniedSourcesRef.current.clear();
    handlingFailureRef.current = false;
    autoRetryCountRef.current = 0;
    stablePlaybackSinceRef.current = null;
    everPlayedRef.current = false;
    lastResumeAttemptRef.current = 0;
    decoderBaselineRef.current=null;
    smoothPlaybackUntilRef.current=0;
    setWebglFailed(false);
    setHqSourceSize({width:0,height:0});
    setSourceIndex(0);
    setGestureRequired(false);
    setUseLegacyOnMismatch(false);
    setUseEdgeBackup(false);
    setAttemptMode(initialModeFor(validStreams[0], braveFirstPartyRef.current, proxyBackend));
    setError(validStreams.length === 0);
    onPlaybackStatus?.(canal.id, validStreams.length ? "connecting" : "unavailable");
    setErrorDetail(null);
    setLoading(validStreams.length > 0);
    setAutoSwitchMsg(null);
    setPlayNonce((n) => n + 1);
  }, [canal.id, validStreams, onPlaybackStatus]);

  const rawFonte: FonteTV | undefined = validStreams[sourceIndex];
  const allSourcesDenied = validStreams.length > 0 &&
    validStreams.every(source => accessDeniedSourcesRef.current.has(source.url));
  const autoRetryPending = error && !allSourcesDenied &&
    nextLiveAutoRetryDelay(autoRetryCountRef.current, validStreams.length) !== null;

  // Seleciona a rota de proxy efetivamente disponível no deploy.
  // O catálogo remoto pode estar atualizado, enquanto o backend da Vercel
  // ainda não possui a rota nova /api/tv/stream.
  const streamUrl = useMemo(() => {
    if (!rawFonte?.url) return "";
    if (attemptMode === "direct") return rawFonte.url;
    const index = canal.fontes.findIndex((candidate) => candidate.url === rawFonte.url);
    const proxyPath = buildLiveProxyPath(canal.id, index, rawFonte,
      proxyBackend === "catalog" && !useLegacyOnMismatch);
    // The fallback always uses a signed, catalog-indexed request on our own
    // deployment, even if the primary Vercel backend was detected as legacy
    // or unavailable during a cold start. Never forward an arbitrary URL.
    const backupPath = buildLiveProxyPath(canal.id, index, rawFonte, index >= 0);
    return useEdgeBackup ? (tvEdgeBackupUrl(backupPath) || proxyPath) : proxyPath;
  }, [rawFonte, attemptMode, canal.id, canal.fontes, proxyBackend, useLegacyOnMismatch, useEdgeBackup]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (sourcesOpen || castOpen || volumeOpen || loading || error) return;
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), isFullscreen?1600:3000);
  }, [sourcesOpen, castOpen, volumeOpen, loading, error, isFullscreen]);

  useEffect(()=>{
    showControls();
    return()=>{if(hideTimerRef.current)clearTimeout(hideTimerRef.current);};
  },[showControls]);

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
      const hlsManaged = Boolean(hlsInstanceRef.current?.engineManagesLatency);
      const decision = decideLiveCatchup({
        edge, current:video.currentTime,
        syncPosition:hlsInstanceRef.current?.liveSyncPosition??undefined,
        bufferAhead, stalled:video.readyState < 3,
        paused:video.paused, mode:latencyMode, hlsManaged,
      });
      setIsLiveEdge(decision.behind < (latencyMode === "fast" ? 9 : 20));
      const quality=typeof video.getVideoPlaybackQuality==="function"
        ?video.getVideoPlaybackQuality():null;
      const baseline=decoderBaselineRef.current;
      if(quality){
        decoderBaselineRef.current={dropped:quality.droppedVideoFrames,total:quality.totalVideoFrames};
        if(baseline&&shouldEaseLiveCatchup({
          droppedDelta:Math.max(0,quality.droppedVideoFrames-baseline.dropped),
          totalDelta:Math.max(0,quality.totalVideoFrames-baseline.total),
          bufferAhead,
        }))smoothPlaybackUntilRef.current=Date.now()+16000;
      }
      if(bufferAhead<1.5)smoothPlaybackUntilRef.current=Date.now()+12000;
      const protectingFrames=Date.now()<smoothPlaybackUntilRef.current;
      hlsInstanceRef.current?.setPlaybackSafety?.(protectingFrames);
      if(decision.action === "seek"&&!protectingFrames) {
        const position = Math.max(safeStart + 0.05, Math.min(edge - 0.5, decision.position));
        if (position > video.currentTime + 0.5) video.currentTime = position;
      } else if (!hlsManaged) {
        // 1–2.5% correction, never a disruptive acceleration when video
        // drops frames or buffer is small; high-speed skips are forbidden.
        const desired=decision.action==="speed"&&!protectingFrames?decision.rate:1;
        if(Math.abs(video.playbackRate-desired)>0.001)video.playbackRate=desired;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") checkEdge();
    };
    const interval = window.setInterval(checkEdge, 1250);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      if (video.playbackRate !== 1) video.playbackRate = 1;
    };
  }, [latencyMode, streamUrl]);

  useEffect(()=>{
    hlsInstanceRef.current?.setHq?.(hqEnabled);
  },[hqEnabled]);

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
  const handleFatalError = useCallback((isNetworkError = false, upstreamStatus?: number, pictureFault?:PictureFault) => {
    if (!rawFonte || handlingFailureRef.current) return;
    handlingFailureRef.current = true;
    stablePlaybackSinceRef.current = null;
    setGestureRequired(false);
    const key = `${canal.id}:${rawFonte.url}`;
    forgetPictureSource(canal.id,liveSourceFingerprint(rawFonte.url));
    setPictureReady(false);
    // A healthy transport is not proof of visible picture. Try another
    // declared source of the SAME channel first, never a different channel.
    if(pictureFault){
      pictureTriedRef.current.add(rawFonte.url);
      const next=nextPictureSource(validStreams,sourceIndex,pictureTriedRef.current,accessDeniedSourcesRef.current);
      if(next!==null){
        recordFailedSource(rawFonte.url);setUseEdgeBackup(false);setUseLegacyOnMismatch(false);
        setSourceIndex(next);setAttemptMode(initialModeFor(validStreams[next],braveFirstPartyRef.current,proxyBackend));
        setLoading(true);setError(false);setErrorDetail(null);setAutoSwitchMsg("Ajustando imagem · outro servidor…");setPlayNonce(n=>n+1);return;
      }
    }
    const index = canal.fontes.findIndex(item => item.url === rawFonte.url);
    // Do not derive the backup URL from the failing Vercel route selection:
    // the primary may use /api/live-proxy while the healthy secondary uses
    // /api/tv/stream with a catalog fingerprint.
    const signedBackupPath = buildLiveProxyPath(canal.id, index, rawFonte, index >= 0);
    if (shouldTryTvEdgeBackup({
      hostname: window.location.hostname,
      mode: attemptMode,
      backend: proxyBackend,
      proxyPath: signedBackupPath,
      upstreamStatus,
      tried: edgeBackupTriedRef.current.has(key) || useEdgeBackup,
    }) && tvEdgeBackupUrl(signedBackupPath)) {
      // Vercel and Cloudflare are both deployments of this application.
      // Try the Cloudflare endpoint once ONLY for transport errors; a 403
      // remains an authorization refusal and never triggers failover.
      edgeBackupTriedRef.current.add(key);
      setUseEdgeBackup(true);
      setLoading(true);
      setError(false);
      setErrorDetail(null);
      setAutoSwitchMsg("Reconectando por servidor alternativo…");
      setPlayNonce(n => n + 1);
      return;
    }
    setUseEdgeBackup(false);
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
    const next = validStreams.findIndex((source,i)=>i>sourceIndex&&!pictureTriedRef.current.has(source.url)&&!accessDeniedSourcesRef.current.has(source.url));
    if (next >= 0) {
      setSourceIndex(next);
      setAttemptMode(initialModeFor(validStreams[next], braveFirstPartyRef.current, proxyBackend));
      setLoading(true);
      setError(false);
      setAutoSwitchMsg("Trocando fonte…");
      setPlayNonce((n) => n + 1);
      return;
    }
    // Stop automatic repeat attempts when every declared source has already
    // refused playback with a permanent HTTP authorization/not-found status.
    // A user-initiated retry still clears the state and can work on another
    // network, but the app must not look like it is loading forever.
    if (validStreams.length > 0 &&
        validStreams.every(source => accessDeniedSourcesRef.current.has(source.url))) {
      setErrorDetail("As fontes deste canal recusaram o acesso ou foram removidas. Tente novamente mais tarde ou escolha outro canal.");
    }
    setLoading(false);
    setError(true);
    setAutoSwitchMsg(null);
    onPlaybackStatus?.(canal.id, "unavailable");
    onSourcesExhausted?.();
  }, [rawFonte, canal.id, canal.fontes, attemptMode, proxyBackend, useLegacyOnMismatch,
    useEdgeBackup, sourceIndex, validStreams, onPlaybackStatus, onSourcesExhausted]);

  // Ao esgotar as rotas/fontes, refaz automaticamente a mesma limpeza do
  // botão manual. Espera a aba ficar visível, com backoff e tentativas finitas.
  useEffect(() => {
    const delay = nextLiveAutoRetryDelay(autoRetryCountRef.current, validStreams.length);
    // Provider access refusals are terminal until a fresh catalog or manual
    // retry; do not keep hammering a 401/403/410/removed origin.
    if (!error || allSourcesDenied || delay === null) return;

    let retryTimer: number | null = null;
    let disposed = false;
    const restart = () => {
      retryTimer = null;
      if (disposed || document.visibilityState === "hidden") return;
      autoRetryCountRef.current += 1;
      clearAllPlayerCaches();
      pictureTriedRef.current.clear();
      attemptedModesRef.current.clear();
      edgeBackupTriedRef.current.clear();
      setUseEdgeBackup(false);
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
  }, [error, allSourcesDenied, validStreams, canal.id]);

  // Android WebView explicitly pauses <video> when its Activity goes into
  // background. The native shell resumes the WebView but not media playback.
  // Recover a previously verified live session when returning to the app.
  // Normal websites remain unaffected because there is no pause button in
  // this live player, and failed/suspended sessions are not falsely resumed.
  useEffect(() => {
    const resume = () => {
      const video = videoRef.current;
      if (document.visibilityState === "hidden" || !video ||
          !everPlayedRef.current || loading || error || video.ended || !video.paused || !rawFonte ||
          !navigator.onLine) return;
      const now = Date.now();
      if (now - lastResumeAttemptRef.current < 4000) return;
      lastResumeAttemptRef.current = now;
      void video.play().catch(async () => {
        try {
          video.muted = true;
          setMuted(true);
          setUnmuteNotice(true);
          await video.play();
        } catch {
          // On some WebViews the paused media element must be recreated.
          setPlayNonce(n => n + 1);
        }
      });
    };
    const visibility = () => { if (!document.hidden) resume(); };
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", visibility);
    // Some embedded Android WebViews do not dispatch a browser 'focus' event
    // when the Activity resumes. A low-frequency foreground check catches it.
    const foregroundCheck = window.setInterval(resume, 4500);
    return () => {
      window.clearInterval(foregroundCheck);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [rawFonte, error, loading]);

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
      if (!video || document.visibilityState === "hidden" || !navigator.onLine) {
        last = video?.currentTime ?? last;
        advancedAt = Date.now();
        return;
      }
      // An established live broadcast should not finish like a VOD. Some
      // origins end a playlist without emitting a media error; ended also
      // implies paused, so handle it before the normal pause guard.
      if (video.ended && everPlayedRef.current) {
        handleFatalError(false);
        return;
      }
      if (video.paused || video.ended || video.seeking) {
        last = video.currentTime;
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
      if (!streamUrl) {
        setError(true);
        onPlaybackStatus?.(canal.id, "unavailable");
      }
      return;
    }
    handlingFailureRef.current = false;
    decoderBaselineRef.current=null;
    smoothPlaybackUntilRef.current=0;
    let cancelled = false;
    setPictureReady(false);
    setLoading(true);
    onPlaybackStatus?.(canal.id, "connecting");
    setError(false);
    setErrorDetail(null);
    setGestureRequired(false);

    // Não considerar apenas readyState: o vídeo pode ter buffer e nunca iniciar.
    let playbackConfirmed = false;
    let progressReference: number | null = null;
    let playbackProgressVerified = false;
    let inspectingNativeError = false;
    const pictureWatchdog=createPictureWatchdog();
    let pixelReadUnavailable=Boolean(rawFonte?.chave);
    let canvas:HTMLCanvasElement|null=null;
    let ctx:CanvasRenderingContext2D|null=null;
    let frameSerial=0,frameRequest:number|null=null;
    const requestFrame=()=>{
      if(cancelled||frameRequest!==null||typeof video.requestVideoFrameCallback!=="function")return;
      frameRequest=video.requestVideoFrameCallback(()=>{frameRequest=null;frameSerial++;});
    };
    let baselineFrames=video.getVideoPlaybackQuality?.().totalVideoFrames??0;
    const frameCounter=()=>{const count=video.getVideoPlaybackQuality?.().totalVideoFrames;
      if(typeof count==="number"&&count<baselineFrames)baselineFrames=0;
      if(typeof count==="number"&&count>baselineFrames)return Math.max(frameSerial,count-baselineFrames);
      if(typeof video.requestVideoFrameCallback==="function")return frameSerial;
      return typeof count==="number"?0:null;};
    let latestPicture:PictureSample="unknown";
    let healthySince:number|null=null;
    let verifiedFrame=false;
    const samplePicture=():PictureSample=>{
      // Respect protected media and CORS; never retry a tainted canvas.
      if(pixelReadUnavailable||video.mediaKeys||video.readyState<2||!video.videoWidth||!video.videoHeight)return "unknown";
      try{if(!canvas){canvas=document.createElement("canvas");canvas.width=32;canvas.height=18;ctx=canvas.getContext("2d",{willReadFrequently:true});}
        if(!ctx)return "unknown";ctx.drawImage(video,0,0,32,18);return classifyPicture(ctx.getImageData(0,0,32,18).data);
      }catch{pixelReadUnavailable=true;return "unknown";}
    };
    requestFrame();
    const timeout = setTimeout(() => {
      if (!cancelled && !playbackProgressVerified &&
          document.visibilityState !== "hidden") {
        console.warn(`[LivePlayer] Timeout ao conectar na fonte ${sourceIndex + 1} (${attemptMode})`);
        handleFatalError(false, attemptMode === "proxy" ? 0 : undefined);
      }
    }, 18000);

    const requireGesture = (reason: unknown): boolean => {
      if (!needsPlaybackGesture(reason) || cancelled) return false;
      // NotAllowedError indicates a user-activation policy, not a broken CDN.
      // Preserve the engine and its source instead of cycling every channel.
      clearTimeout(timeout);
      setLoading(false);
      setGestureRequired(true);
      setError(false);
      setAutoSwitchMsg(null);
      return true;
    };

    const onPlaying = () => {
      if (cancelled) return;
      requestFrame();
      setGestureRequired(false);
      playbackConfirmed = true;
      if (progressReference === null) progressReference = video.currentTime;
      stablePlaybackSinceRef.current = Date.now();
      setError(false);
      // A 'playing' event with a still-frozen frame is not real playback.
      // Keep the startup deadline and loading indicator until time advances.
      setErrorDetail(null);
      setAutoSwitchMsg(null);
      if (video.muted) {
        setUnmuteNotice(true);
      }
    };

    const onTimeUpdate = () => {
      if (playbackConfirmed && !playbackProgressVerified && verifiedFrame && latestPicture!=="black" &&
          progressReference !== null && Number.isFinite(video.currentTime) &&
          Math.abs(video.currentTime - progressReference) >= 1) {
        playbackProgressVerified = true;
        setPictureReady(true);
        everPlayedRef.current = true;
        if (rawFonte) accessDeniedSourcesRef.current.delete(rawFonte.url);
        clearTimeout(timeout);
        setLoading(false);
        setError(false);
        setAutoSwitchMsg(null);
        onPlaybackStatus?.(canal.id, "playing");
      }
      if (video.currentTime > 0.5) {
        // Do not overwrite the actual seekable-edge decision above on every
        // timeupdate: the previous code permanently showed "AO VIVO" even
        // when the decoder had accumulated several seconds of delay.
        // Um canal estável volta a ter direito a novas recuperações futuras.
        if (stablePlaybackSinceRef.current !== null && Date.now() - stablePlaybackSinceRef.current >= 45_000) {
          autoRetryCountRef.current = 0;
          stablePlaybackSinceRef.current = null;
        }
      }
    };

    const pictureTimer=window.setInterval(()=>{
      if(cancelled||handlingFailureRef.current)return;
      const active=playbackConfirmed&&!video.paused&&!video.ended&&!video.seeking&&video.readyState>=2&&document.visibilityState!=="hidden"&&navigator.onLine;
      if(!active){pictureWatchdog.reset();healthySince=null;return;}
      const dimensions=video.videoWidth>0&&video.videoHeight>0;
      const frames=frameCounter();requestFrame();
      latestPicture=samplePicture();
      verifiedFrame=dimensions&&(frames===null||frames>0)&&latestPicture!=="black";
      const now=Date.now();
      const fault=pictureWatchdog.observe({now,mediaTime:video.currentTime,active,dimensions,frameCounter:frames,picture:latestPicture});
      if(fault){
        healthySince=null;stablePlaybackSinceRef.current=null;
        // Remove optional GPU processing before changing the source.
        if(hqActiveRef.current&&!hqPictureSuppressedRef.current){hqPictureSuppressedRef.current=true;setHqPictureSuppressed(true);pictureWatchdog.reset();setAutoSwitchMsg("Restaurando imagem original…");return;}
        console.warn("[LivePlayer] Falha visual persistente:",fault);
        handleFatalError(false,undefined,fault);return;
      }
      if(verifiedFrame){onTimeUpdate();healthySince??=now;if(playbackProgressVerified&&rawFonte&&now-healthySince>=15000){rememberPictureSource(canal.id,liveSourceFingerprint(rawFonte.url),now);healthySince=now;setAutoSwitchMsg(null);}}
      else healthySince=null;
    },2000);

    const onError = () => {
      if (cancelled || inspectingNativeError) return;
      clearTimeout(timeout);
      const cannotDecode = video.error?.code === 4;
      if (cannotDecode) {
        setErrorDetail((existing) => existing ||
          "O navegador não conseguiu abrir a fonte. A transmissão pode estar bloqueada ou usar um formato incompatível.");
      }
      // Native WebViews sometimes omit the HTTP response entirely; check the
      // SAME-ORIGIN proxy once so a 403 can stop the automatic retry loop.
      if (cannotDecode && attemptMode === "proxy") {
        inspectingNativeError = true;
        void probeFailedLiveProxy(streamUrl).then(status => {
          if (cancelled) return;
          if (status && [401, 403, 404, 410].includes(status) && rawFonte) {
            accessDeniedSourcesRef.current.add(rawFonte.url);
            setErrorDetail("A origem recusou a transmissão (HTTP " + status +
              "). É necessária uma fonte válida e autorizada para este canal.");
          }
          handleFatalError(false, status && [502, 503, 504].includes(status) ? status : undefined);
        });
        return;
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
              `/api/live-format?canal=${encodeURIComponent(canal.id)}&fonte=${originalIndex}&assinatura=${liveSourceFingerprint(rawFonte.url)}`,
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
            } catch (reason) {
              // Audible autoplay may be blocked while muted playback works.
              try {
                video.muted = true;
                setMuted(true);
                setUnmuteNotice(true);
                await video.play();
              } catch (again) { requireGesture(again) || requireGesture(reason); }
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
            player.on?.(mpegts.Events?.ERROR || "error", (...details: unknown[]) => {
              if (cancelled) return;
              console.warn("[LivePlayer] Falha MPEG-TS; iniciando recuperação", details[0]);
              handleFatalError(true);
            });
            player.attachMediaElement(video);
            player.load();
            void player.play().catch(reason => {
              video.muted = true;
              void player.play().catch(again => { requireGesture(again) || requireGesture(reason); });
            });
            hlsInstanceRef.current = {
              destroy: () => { player.unload(); player.destroy(); },
              engineManagesLatency:true, // MPEG-TS already chases its own buffer.
            };
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
            const hlsConfig: Record<string, unknown> = {
              ...hlsLatencyOptions(latencyMode),
              // HQ unlocks genuine higher available HLS renditions, subject
              // to bandwidth and FPS ABR. Never force a 4K level.
              capLevelToPlayerSize:!hqEnabledRef.current,
            };

            if (hasNested && (Hls as any).DefaultConfig?.loader) {
              hlsConfig["loader"] = makeNestedPathLoader(Hls, rawFonte?.url || streamUrl);
            }

            const hls = new Hls(hlsConfig);

            hls.loadSource(streamUrl);
            hls.attachMedia(video);

            let recoveryCount = 0;
            hls.on(Hls.Events.ERROR, (_, data: any) => {
              if (cancelled) return;
              const isNet = data?.type === "networkError";
              const isMedia = data?.type === "mediaError";
              const responseCode = Number(
                data?.response?.code ?? data?.response?.status ??
                data?.networkDetails?.status ?? 0
              );
              const detail = String(data?.details || "");
              // Some versions of Hls.js report an HTTP 403 as nonfatal while
              // retrying a manifest forever. A rejected origin must advance
              // to the next valid source, not leave the user on "Carregando".
              if (!terminalHlsLoadFailure(responseCode, detail, Boolean(data?.fatal))) return;
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
              if (accessDeniedLiveSource(responseCode, detail) && rawFonte) {
                accessDeniedSourcesRef.current.add(rawFonte.url);
              }
              // Vercel proxy outages need an edge retry, not another reload
              // of the same broken Vercel HTTP connection.
              if (isNet && attemptMode === "proxy" && !useEdgeBackup &&
                  [502, 503, 504].includes(responseCode)) {
                handleFatalError(true, responseCode);
                return;
              }
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
              handleFatalError(isNet, isNet ? responseCode : undefined);
            });

            hlsInstanceRef.current = {
              destroy: () => hls.destroy(),
              engineManagesLatency:true,
              get liveSyncPosition() {
                return hls.liveSyncPosition;
              },
              setHq:enabled=>{
                // The HLS ABR engine can change level cap without reloading
                // the playlist, avoiding a blackout when HQ is clicked.
                (hls as unknown as {capLevelToPlayerSize:boolean}).capLevelToPlayerSize=!enabled;
              },
              setPlaybackSafety:enabled=>{
                (hls as unknown as {config:{maxLiveSyncPlaybackRate:number}}).config.maxLiveSyncPlaybackRate=enabled?1:
                  hlsLatencyOptions(latencyMode).maxLiveSyncPlaybackRate;
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
          } catch (reason) {
            // Preserve the normal muted-autoplay fallback in Edge and Brave.
            try {
              video.muted = true;
              setMuted(true);
              setUnmuteNotice(true);
              await video.play();
            } catch (again) { requireGesture(again) || requireGesture(reason); }
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
      window.clearInterval(pictureTimer);
      if(frameRequest!==null&&typeof video.cancelVideoFrameCallback==="function")video.cancelVideoFrameCallback(frameRequest);
      pictureWatchdog.reset();canvas=null;ctx=null;
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
  }, [streamUrl, sourceIndex, attemptMode, playNonce, handleFatalError, latencyMode, canal.id, onPlaybackStatus]);

  // Source changes and browser/native volume events share the same persisted level.
  useEffect(()=>{
    const video=videoRef.current;if(!video)return;
    video.volume=volumeRef.current;
    const synchronize=()=>{
      const level=clampVolume(video.volume);volumeRef.current=level;setVolume(level);setMuted(video.muted);
      if(level>0)lastAudibleVolume.current=level;
      try{localStorage.setItem(LIVE_VOL_KEY,String(level));}catch{/* Storage may be unavailable. */}
    };
    video.addEventListener("volumechange",synchronize);
    return()=>video.removeEventListener("volumechange",synchronize);
  },[streamUrl,playNonce]);
  const handleVolumeChange = useCallback((requested:number)=>{
    const video=videoRef.current;if(!video)return;
    const level=clampVolume(requested);video.volume=level;
    if(Math.abs(video.volume-level)>.01){setVolumeHardwareOnly(true);setVolume(video.volume);return;}
    volumeRef.current=level;setVolume(level);
    if(level>0){lastAudibleVolume.current=level;video.muted=false;setMuted(false);setUnmuteNotice(false);}
    else {video.muted=true;setMuted(true);}
    try{localStorage.setItem(LIVE_VOL_KEY,String(level));}catch{}
  },[]);
  const handleToggleMute = useCallback(()=>{
    const video=videoRef.current;if(!video)return;
    if(video.muted||video.volume===0){handleVolumeChange(video.volume>0?video.volume:lastAudibleVolume.current);}
    else{video.muted=true;setMuted(true);}
  },[handleVolumeChange]);

  const handlePiPToggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => {});
    } else if (document.pictureInPictureEnabled) {
      void video.requestPictureInPicture().catch(() => {});
    }
  }, []);

  useEffect(()=>{
    document.addEventListener("zf-reveal-player-controls",showControls);
    return()=>document.removeEventListener("zf-reveal-player-controls",showControls);
  },[showControls]);

  // Atalhos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if(e.defaultPrevented)return;
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      const tv=document.documentElement.dataset["zfPlatform"]==="tv";
      if(tv&&["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)){showControls();return;}
      if(e.key==="+"||e.key==="="||e.key==="AudioVolumeUp"){
        e.preventDefault();handleVolumeChange(stepVolume(volumeRef.current,1));
      }else if(e.key==="-"||e.key==="AudioVolumeDown"){
        e.preventDefault();handleVolumeChange(stepVolume(volumeRef.current,-1));
      }else if (e.key === "ArrowUp") {
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
  }, [onPrevCanal, onNextCanal, handleToggleMute, handleFullscreenToggle, onToggleGuide, showControls, handleVolumeChange]);

  // A direct user gesture is required when the browser forbids autoplay,
  // including cases where muted autoplay is disabled in site preferences.
  const startPlaybackFromGesture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    // Must call play() synchronously inside the click, before any await.
    const action = video.play();
    setGestureRequired(false);
    setLoading(true);
    void action.catch(reason => {
      if (needsPlaybackGesture(reason)) {
        setGestureRequired(true);
        setLoading(false);
        setErrorDetail("O navegador bloqueou o início automático. Verifique a permissão de reprodução deste site.");
      } else {
        handleFatalError(true);
      }
    });
  }, [handleFatalError]);

  return (
    <div
      ref={containerRef}
      className={"ydo-live-player-container" + (theaterFullscreen ? " is-theater" : "") + (rotateLandscapeFallback ? " is-landscape-fallback" : "")}
      data-controls-visible={controlsVisible}
      data-hq-renderer={hqStatus}
      data-sports-deinterlace={deinterlacer.active?"active":
        deinterlacer.failed?"unavailable":"pending"}
      onMouseMove={showControls}
      onTouchStart={showControls}
      onFocusCapture={showControls}
    >
      <div className="zf-fullscreen-surface">
      <div className="zf-live-brand" aria-hidden="true"><img src="/brand/zang-mark.webp?v=2" alt="" width={128} height={89} /></div>
      <video
        ref={videoRef}
        className="ydo-live-video"
        playsInline
        preload="none"
        webkit-playsinline="true"
        onClick={handleToggleMute}
        onLoadedMetadata={measureLiveQuality}
        onResize={measureLiveQuality}
        style={{
          opacity:hqActive?0:1,
          filter:liveHqFilter(hqEnabled&&!hqPictureSuppressed,hqActive),
          transition:"opacity .12s ease",
        }}
      />
      {/* Correct combing BEFORE enlargement: the original video remains
          the audio/latency clock and always survives GPU or CORS failure. */}
      <canvas ref={deinterlaceCanvasRef}
        className={"ydo-live-hq-canvas ydo-live-deinterlace-canvas"+
          (hqStatus==="deinterlace"?" is-active":"")}
        aria-hidden="true"/>
      {/* Two sequential real trained CNN 2× stages = true 4× pixel output
          only when a small source and powerful GPU can sustain live FPS. */}
      <canvas ref={neural4xCanvasRef}
        className={"ydo-live-hq-canvas ydo-live-ai4x-canvas"+
          (hqStatus==="ai-4x"?" is-active":"")}
        aria-hidden="true"/>
      <canvas ref={neuralCanvasRef}
        className={"ydo-live-hq-canvas ydo-live-ai-canvas"+(hqStatus==="ai-2x"?" is-active":"")}
        aria-hidden="true"/>
      <canvas ref={hqCanvasRef}
        className={"ydo-live-hq-canvas ydo-live-spatial-canvas"+(hqStatus==="spatial"?" is-active":"")}
        aria-hidden="true"/>

      {/* Camada de clique: clicar no vídeo muta/desmuta (ao vivo nunca pausa) */}
      <div
        className="ydo-live-click-layer"
        onClick={handleToggleMute}
        aria-label="Ativar ou desativar áudio"
      />

      {gestureRequired && !error && (
        <div className="zf-live-gesture-overlay" role="group" aria-label="Iniciar transmissão">
          <button type="button" className="zf-live-gesture-play"
            onClick={startPlaybackFromGesture} aria-label="Reproduzir canal ao vivo">
            <Play size={20} fill="currentColor" aria-hidden="true"/>
            <span>Iniciar transmissão</span>
          </button>
          <small>Este navegador precisa de um clique para iniciar o vídeo.</small>
        </div>
      )}

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
          {braveCompatibility && (
            <span className="zf-live-compat-status" title="O player tenta primeiro a rota interna; o acesso direto continua disponível se necessário.">
              Navegador protegido · conexão adaptativa
            </span>
          )}
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
            <TvMinimal size={36} className="ydo-live-loading-icon" />
            <div className="ydo-live-skeleton-bar short" />
            <div className="ydo-live-skeleton-bar" />
            <span>Sintonizando…</span>
          </div>
        </div>
      )}

      {/* Estado de erro após esgotar todas as fontes */}
      {error && (
        <div className="ydo-live-error-overlay">
          <AlertCircle size={44} style={{ color: "#ff525b" }} />
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
              pictureTriedRef.current.clear();hqPictureSuppressedRef.current=false;setHqPictureSuppressed(false);
              edgeBackupTriedRef.current.clear();
              setUseEdgeBackup(false);
              accessDeniedSourcesRef.current.clear();
              handlingFailureRef.current = false;
              autoRetryCountRef.current = 0;
              stablePlaybackSinceRef.current = null;
              clearAllPlayerCaches();
              limparHostsSemCors();
              setSourceIndex(0);
              setAttemptMode(initialModeFor(validStreams[0], braveFirstPartyRef.current, proxyBackend));
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
          <LiveVolumeControl volume={volume} muted={muted} onVolume={handleVolumeChange} onMute={handleToggleMute}
            onDialogChange={onVolumeDialogChange} hardwareOnly={volumeHardwareOnly} otherOpen={sourcesOpen||castOpen}/>
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
          <button type="button"
            className={"zf-player-action zf-live-hq-button"+(hqEnabled?" is-on":"")}
            aria-pressed={hqEnabled}
            aria-label={hqEnabled?"Desativar melhoria de imagem HQ":"Ativar melhoria de imagem HQ"}
            title={hqStatus==="ai-4x"?"HQ IA 4× · CNN 2× em duas etapas":
              hqStatus==="ai-2x"?"HQ IA · super-resolução neural 2× ativa":
              hqStatus==="spatial"?"HQ · reconstrução espacial e deinterlace":
              hqStatus==="deinterlace"?"HQ · desentrelaçamento adaptativo de movimento":
              hqEnabled?"HQ automático · melhor qualidade disponível":
                "Ativar HQ automático"}
            onClick={toggleHq}>
            <span aria-hidden="true">HQ</span><span className="zf-live-hq-dot" aria-hidden="true"/>
          </button>
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
                <div className="zf-player-menu-header">Ajustes do player<button type="button" aria-label="Fechar ajustes" onClick={()=>setSourcesOpen(false)}>×</button></div>
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
                  <span>{latencyMode === "fast" ? "Atraso mínimo · automático" : "Modo fluido · maior buffer"}</span>
                  <span className="zf-player-menu-hint">Trocar</span>
                </button>
                <button type="button" className={"zf-player-menu-option"+(hqEnabled?" is-selected":"")}
                  onClick={toggleHq} aria-pressed={hqEnabled}>
                  <span className="zf-live-hq-menu-symbol" aria-hidden="true">HQ</span>
                  <span>HQ · {hqStatus==="ai-4x"?"IA 4× (duas passagens)":
                    hqStatus==="ai-2x"?"IA 2× em tempo real":
                    hqStatus==="spatial"?"Reconstrução espacial":
                    hqStatus==="deinterlace"?"Deinterlace adaptativo":
                    hqEnabled?(neural.status==="loading"||neural4x.status==="loading"?
                      "Preparando IA…":"Processamento nativo"):"Desativado"}</span>
                  <span className="zf-player-menu-hint">{hqEnabled?"Ligado":"Desligado"}</span>
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
                      pictureTriedRef.current.clear();setUseEdgeBackup(false);setUseLegacyOnMismatch(false);
                      handlingFailureRef.current = false;
                      setSourceIndex(i);
                      setAttemptMode(initialModeFor(f, braveFirstPartyRef.current, proxyBackend));
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
            streamUrl={streamUrl} channelName={canal.nome} channelId={canal.id} sources={canal.fontes}
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
    </div>
  );
}
