"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { CanalTV, FonteTV } from "@/lib/canais";
import type { ProgramaEPG } from "@/lib/epg";
import {
  sortStreamsByHealth,
  recordFailedSource,
  clearFailedSources,
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
    shaka?: any;
  }
}

async function loadScript(src: string): Promise<void> {
  if (document.querySelector(`script[src="${src}"]`)) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Falha ao carregar script ${src}`));
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

async function ensureShaka() {
  if (!window.shaka) {
    await loadScript("https://cdn.jsdelivr.net/npm/shaka-player@4.11.2/dist/shaka-player.compiled.js");
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

const initialModeFor = (f: FonteTV | undefined): "direct" | "proxy" => {
  if (!f) return "proxy";
  // .txt masters vêm como text/plain sem CORS — direto no proxy
  if (f.url.split("?")[0].toLowerCase().endsWith(".txt")) {
    // ...exceto CDNs com CORS aberto (s23-cloudfront-net.lat toca direto)
    if (!f.url.includes("s23-cloudfront-net.lat")) return "proxy";
  }
  if (!f.url.startsWith("https://")) return "proxy"; // http = mixed-content
  if (f.chave || f.url.includes(".mpd")) return "direct"; // DASH direto primeiro
  if (hostSemCors(f.url)) return "proxy"; // memória de hosts sem cors
  return "direct";
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
}: LivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsInstanceRef = useRef<{ destroy: () => void; liveSyncPosition?: number } | null>(null);
  const shakaInstanceRef = useRef<{ destroy: () => Promise<unknown> | void } | null>(null);

  // Ordem https-first preservando a ordem curada do catálogo, com suporte total a DASH/ClearKey
  const validStreams = useMemo(() => {
    const usable = canal.fontes.filter((f) => {
      const u = f.url.toLowerCase();
      return !u.includes("error.txt") && !u.includes("offline");
    });
    const pool = usable.length > 0 ? usable : canal.fontes;
    const httpsList: FonteTV[] = [];
    const httpList: FonteTV[] = [];
    for (const f of pool) {
      if (f.url.startsWith("https://")) httpsList.push(f);
      else httpList.push(f);
    }
    return sortStreamsByHealth([...httpsList, ...httpList]);
  }, [canal.fontes]);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [attemptMode, setAttemptMode] = useState<"direct" | "proxy">(() =>
    initialModeFor(validStreams[0])
  );
  const [playNonce, setPlayNonce] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);
  const [error, setError] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return 1;
    const saved = localStorage.getItem(LIVE_VOL_KEY);
    return saved !== null ? Number(saved) : 1;
  });
  const [isLiveEdge, setIsLiveEdge] = useState(true);
  const [autoSwitchMsg, setAutoSwitchMsg] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [unmuteNotice, setUnmuteNotice] = useState(false);

  // Reseta ao trocar de canal
  useEffect(() => {
    setSourceIndex(0);
    setAttemptMode(initialModeFor(validStreams[0]));
    setError(false);
    setLoading(true);
    setAutoSwitchMsg(null);
    setPlayNonce((n) => n + 1);
  }, [canal.id, validStreams]);

  const rawFonte: FonteTV | undefined = validStreams[sourceIndex];

  // Resolve URL da fonte (direto ou retransmitido pelo live-proxy)
  const streamUrl = useMemo(() => {
    if (!rawFonte?.url) return "";
    if (attemptMode === "direct") return rawFonte.url;
    let proxy = `/api/live-proxy?url=${encodeURIComponent(rawFonte.url)}`;
    if (rawFonte.referer) proxy += `&referer=${encodeURIComponent(rawFonte.referer)}`;
    if (rawFonte.agente) proxy += `&ua=${encodeURIComponent(rawFonte.agente)}`;
    return proxy;
  }, [rawFonte, attemptMode]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!sourcesOpen) {
        setControlsVisible(false);
      }
    }, 3500);
  }, [sourcesOpen]);

  // Sincroniza borda ao vivo (Live Edge)
  const syncToLiveEdge = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (hlsInstanceRef.current?.liveSyncPosition !== undefined) {
        video.currentTime = hlsInstanceRef.current.liveSyncPosition;
      } else if (video.seekable.length > 0) {
        const edge = video.seekable.end(video.seekable.length - 1);
        video.currentTime = Math.max(0, edge - 0.5);
      }
      setIsLiveEdge(true);
    } catch {
      // continua
    }
  }, []);

  // Monitora se o usuário está na borda ao vivo
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const checkEdge = () => {
      if (video.seekable.length > 0) {
        const edge = video.seekable.end(video.seekable.length - 1);
        const delay = edge - video.currentTime;
        setIsLiveEdge(delay < 15);
      }
    };

    const interval = setInterval(checkEdge, 3000);
    return () => clearInterval(interval);
  }, []);

  // Sincronização periódica a cada 30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (isLiveEdge) {
        syncToLiveEdge();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isLiveEdge, syncToLiveEdge]);

  // Avança para a próxima fonte caso haja falha fatal (escada direto -> proxy -> próxima fonte)
  const handleFatalError = useCallback(
    (isCorsOrNetwork?: boolean) => {
      if (!rawFonte) return;

      // Se falhou no modo DIRETO, anota no cache sem-cors se foi erro de rede/CORS e tenta proxy
      if (attemptMode === "direct") {
        if (isCorsOrNetwork) {
          marcarSemCors(rawFonte.url);
        }
        console.warn(`[LivePlayer] Modo direto falhou para fonte ${sourceIndex + 1}. Retentando via proxy.`);
        setAttemptMode("proxy");
        setLoading(true);
        setError(false);
        setPlayNonce((n) => n + 1);
        return;
      }

      // Se falhou no modo PROXY (ou a fonte começou direto no proxy), registra falha e avança
      recordFailedSource(rawFonte.url);

      if (sourceIndex < validStreams.length - 1) {
        const nextIndex = sourceIndex + 1;
        const nextFonte = validStreams[nextIndex];
        const nextMode = initialModeFor(nextFonte);

        setAutoSwitchMsg("Trocando fonte…");
        const timer = setTimeout(() => {
          setSourceIndex(nextIndex);
          setAttemptMode(nextMode);
          setLoading(true);
          setError(false);
          setAutoSwitchMsg(null);
          setPlayNonce((n) => n + 1);
        }, 700);
        return () => clearTimeout(timer);
      } else {
        setLoading(false);
        setError(true);
        setAutoSwitchMsg(null);
      }
    },
    [rawFonte, attemptMode, sourceIndex, validStreams]
  );

  // Inicializa a reprodução do stream atual
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    let cancelled = false;
    setLoading(true);
    setError(false);

    // Timeout de 8s para conexão rápida em TV ao vivo (Saimo-grade)
    const timeout = setTimeout(() => {
      if (!cancelled) {
        if (video.readyState >= 3) {
          return;
        }
        console.warn(`[LivePlayer] 8s timeout ao conectar na fonte ${sourceIndex + 1} (${attemptMode})`);
        handleFatalError(false);
      }
    }, 8000);

    const onPlaying = () => {
      if (cancelled) return;
      clearTimeout(timeout);
      setLoading(false);
      setError(false);
      setAutoSwitchMsg(null);
      if (video.muted) {
        setUnmuteNotice(true);
      }
    };

    const onTimeUpdate = () => {
      if (video.currentTime > 0.5) {
        setIsLiveEdge(true);
      }
    };

    const onError = () => {
      if (cancelled) return;
      clearTimeout(timeout);
      handleFatalError(attemptMode === "direct");
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("error", onError);

    const setup = async () => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isDash = Boolean(rawFonte?.chave || rawFonte?.url.includes(".mpd"));
      const isTs = rawFonte?.url.includes(".ts") && !rawFonte.url.includes(".m3u8");

      try {
        // 1. DASH + ClearKey via Shaka Player
        if (isDash) {
          const shaka = await ensureShaka();
          if (!shaka?.Player?.isBrowserSupported?.()) {
            console.warn("[LivePlayer] Shaka Player não suportado neste navegador, pulando DASH...");
            handleFatalError(false);
            return;
          }

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
          if (mpegts?.isSupported()) {
            const player = mpegts.createPlayer({
              type: "mpegts",
              url: streamUrl,
              isLive: true,
              cors: true,
            });
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

        // 3. HLS (.m3u8)
        if (!isIOS && video.canPlayType("application/vnd.apple.mpegurl") === "") {
          const Hls = await ensureHls();
          if (Hls?.isSupported()) {
            const hasNested = attemptMode === "direct" && rawFonte?.url.includes("url=");
            const hlsConfig: Record<string, unknown> = {
              enableWorker: true,
              lowLatencyMode: true,
              liveSyncDurationCount: 3,
              liveMaxLatencyDurationCount: 8,
            };

            if (hasNested && (Hls as any).DefaultConfig?.loader) {
              hlsConfig.loader = makeNestedPathLoader(Hls, rawFonte.url);
            }

            const hls = new Hls(hlsConfig);

            hls.loadSource(streamUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.ERROR, (_, data: any) => {
              if (data?.fatal) {
                console.warn("[LivePlayer] Erro fatal Hls.js:", data);
                const isNet = data?.type === "networkError";
                if (!cancelled) handleFatalError(isNet);
              }
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
  }, [streamUrl, sourceIndex, attemptMode, playNonce, handleFatalError]);

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

  const handleFullscreenToggle = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
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
      className="ydo-live-player-container"
      data-controls-visible={controlsVisible}
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      <video
        ref={videoRef}
        className="ydo-live-video"
        playsInline
        preload="none"
        // @ts-expect-error compatibilidade iOS Safari
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
          <h3>Nenhum servidor disponível para este canal</h3>
          <p>
            Tentamos todas as {validStreams.length} fontes deste canal no momento.
            A disponibilidade pode retornar em breve.
          </p>
          <button
            className="ydo-btn-primary"
            onClick={() => {
              clearFailedSources();
              limparHostsSemCors();
              setSourceIndex(0);
              setAttemptMode(initialModeFor(validStreams[0]));
              setError(false);
              setLoading(true);
              setPlayNonce((n) => n + 1);
            }}
          >
            <RefreshCw size={15} /> Tentar novamente
          </button>
        </div>
      )}

      {/* Barra de Controles Inferior */}
      <div className={`ydo-live-controls-bar ${controlsVisible ? "visible" : ""}`}>
        <div className="ydo-live-controls-left">
          {/* Mudo / Volume (Ao vivo substitui play/pause por mute) */}
          <div className="ydo-live-volume-wrap">
            <button
              onClick={handleToggleMute}
              className="ydo-live-ctrl-btn"
              aria-label={muted ? "Ativar som" : "Desativar som"}
            >
              {muted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="ydo-live-volume-slider"
              aria-label="Volume"
            />
          </div>

          {/* Botão AO VIVO dourado (volta à borda live se atrasar) */}
          <button
            onClick={syncToLiveEdge}
            className={`ydo-live-edge-btn ${isLiveEdge ? "is-live" : "is-delayed"}`}
            title={isLiveEdge ? "Transmissão em tempo real" : "Clique para voltar ao vivo"}
          >
            <span className="ydo-live-dot-inner" />
            <span>AO VIVO</span>
          </button>
        </div>

        <div className="ydo-live-controls-right">
          {/* Seletor de Fontes em Pill Glass */}
          <div className="ydo-live-source-selector">
            <button
              onClick={() => setSourcesOpen((prev) => !prev)}
              className="ydo-live-source-pill"
              aria-label="Selecionar servidor ou qualidade"
            >
              <SlidersHorizontal size={13} />
              <span>
                {rawFonte?.nome ||
                  rawFonte?.qualidade ||
                  `Servidor ${sourceIndex + 1}`}
              </span>
            </button>

            {sourcesOpen && (
              <div className="ydo-live-sources-menu animate-scale-in">
                <div className="ydo-live-sources-header">Servidores Disponíveis</div>
                {validStreams.map((f, i) => {
                  const isCurrent = i === sourceIndex;
                  const label =
                    f.nome || f.qualidade || `Servidor ${i + 1}`;
                  return (
                    <button
                      key={f.url + i}
                      onClick={() => {
                        setSourceIndex(i);
                        setAttemptMode(initialModeFor(f));
                        setSourcesOpen(false);
                        setLoading(true);
                        setError(false);
                        setPlayNonce((n) => n + 1);
                      }}
                      className={`ydo-live-source-item ${isCurrent ? "active" : ""}`}
                    >
                      <span className="ydo-live-source-name">{label}</span>
                      {f.qualidade && (
                        <span className="ydo-live-source-badge">{f.qualidade}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* PiP */}
          <button
            onClick={handlePiPToggle}
            className="ydo-live-ctrl-btn"
            aria-label="Picture-in-Picture"
            title="Janela flutuante (PiP)"
          >
            <PictureInPicture2 size={18} />
          </button>

          {/* Tela cheia */}
          <button
            onClick={handleFullscreenToggle}
            className="ydo-live-ctrl-btn"
            aria-label="Tela cheia"
            title="Tela cheia (F)"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
