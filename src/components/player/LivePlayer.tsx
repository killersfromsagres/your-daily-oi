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

const LIVE_VOL_KEY = "zangflix:live-volume";

export function LivePlayer({
  canal,
  epgAtual,
  onNextCanal,
  onPrevCanal,
  onToggleGuide,
}: LivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsInstanceRef = useRef<{ destroy: () => void; liveSyncPosition?: number } | null>(null);

  // Ordena fontes viáveis (pulando .mpd e fontes com chave DASH)
  const validStreams = useMemo(() => {
    const usable = canal.fontes.filter((f) => {
      if (f.chave) return false;
      if (f.url.includes(".mpd")) return false;
      return true;
    });
    return sortStreamsByHealth(usable.length > 0 ? usable : canal.fontes);
  }, [canal.fontes]);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [loading, setLoading] = useState(true);
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
    setError(false);
    setLoading(true);
    setAutoSwitchMsg(null);
  }, [canal.id]);

  const rawFonte: FonteTV | undefined = validStreams[sourceIndex];

  // Resolve URL da fonte (direto se limpa, /api/live-proxy se exigir referer/agente)
  const streamUrl = useMemo(() => {
    if (!rawFonte?.url) return "";
    const u = rawFonte.url;
    if (rawFonte.referer || rawFonte.agente) {
      let proxy = `/api/live-proxy?url=${encodeURIComponent(u)}`;
      if (rawFonte.referer) proxy += `&referer=${encodeURIComponent(rawFonte.referer)}`;
      if (rawFonte.agente) proxy += `&ua=${encodeURIComponent(rawFonte.agente)}`;
      return proxy;
    }
    return u;
  }, [rawFonte]);

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

  // Avança para a próxima fonte caso haja falha fatal
  const handleFatalError = useCallback(() => {
    if (!rawFonte) return;
    recordFailedSource(rawFonte.url);

    if (sourceIndex < validStreams.length - 1) {
      setAutoSwitchMsg("Trocando fonte…");
      const timer = setTimeout(() => {
        setSourceIndex((prev) => prev + 1);
        setLoading(true);
        setError(false);
        setAutoSwitchMsg(null);
      }, 700);
      return () => clearTimeout(timer);
    } else {
      setLoading(false);
      setError(true);
      setAutoSwitchMsg(null);
    }
  }, [rawFonte, sourceIndex, validStreams.length]);

  // Inicializa a reprodução do stream atual
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    let cancelled = false;
    setLoading(true);
    setError(false);

    // Timeout de 14s para inicialização do canal ao vivo
    const timeout = setTimeout(() => {
      if (!cancelled && loading) {
        console.warn(`[LivePlayer] Timeout ao conectar na fonte ${sourceIndex + 1}`);
        handleFatalError();
      }
    }, 14000);

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

    const onError = () => {
      if (cancelled) return;
      clearTimeout(timeout);
      handleFatalError();
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);

    const setup = async () => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isTs = rawFonte?.url.includes(".ts") && !rawFonte.url.includes(".m3u8");

      try {
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

        // HLS (.m3u8)
        if (!isIOS && video.canPlayType("application/vnd.apple.mpegurl") === "") {
          const Hls = await ensureHls();
          if (Hls?.isSupported()) {
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
              liveSyncDurationCount: 3,
              liveMaxLatencyDurationCount: 8,
            });

            hls.loadSource(streamUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.ERROR, (_, data: Record<string, unknown>) => {
              if (data["fatal"]) {
                console.warn("[LivePlayer] Erro fatal Hls.js:", data);
                if (!cancelled) handleFatalError();
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
            // Se o navegador bloquear som, toca mutado para não travar a transmissão
            try {
              video.muted = true;
              setMuted(true);
              setUnmuteNotice(true);
              await video.play();
            } catch {
              // Mantém loading ou aguarda gesto
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[LivePlayer] Falha ao configurar vídeo:", err);
          handleFatalError();
        }
      }
    };

    void setup();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
      hlsInstanceRef.current?.destroy();
      hlsInstanceRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [streamUrl, sourceIndex, handleFatalError]);

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
            <span>Sintonizando transmissão…</span>
          </div>
        </div>
      )}

      {/* Estado de erro após esgotar todas as fontes */}
      {error && (
        <div className="ydo-live-error-overlay">
          <AlertCircle size={44} style={{ color: "#e8b44a" }} />
          <h3>Canal fora do ar agora</h3>
          <p>
            Tentamos todas as {validStreams.length} fontes deste canal no momento.
            A disponibilidade pode retornar em breve.
          </p>
          <button
            className="ydo-btn-primary"
            onClick={() => {
              clearFailedSources();
              setSourceIndex(0);
              setError(false);
              setLoading(true);
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
                  `Fonte ${sourceIndex + 1}`}
              </span>
            </button>

            {sourcesOpen && (
              <div className="ydo-live-sources-menu animate-scale-in">
                <div className="ydo-live-sources-header">Servidores Disponíveis</div>
                {validStreams.map((f, i) => {
                  const isCurrent = i === sourceIndex;
                  const label =
                    f.nome || f.qualidade || `Fonte ${i + 1}`;
                  return (
                    <button
                      key={f.url + i}
                      onClick={() => {
                        setSourceIndex(i);
                        setSourcesOpen(false);
                        setLoading(true);
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
