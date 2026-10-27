"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import {
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  PictureInPicture,
  RefreshCw,
  AlertCircle,
  Radio,
} from "lucide-react";
import type { LiveChannel, LiveStreamSource } from "@/lib/live-types";

interface LivePlayerProps {
  channel: LiveChannel;
  onEnded?: () => void;
  className?: string;
}

export function LivePlayer({ channel, className = "" }: LivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<mpegts.Player | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitchingSource, setIsSwitchingSource] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(() => {
    if (typeof window !== "undefined") {
      const v = localStorage.getItem("ydo_live_volume");
      return v ? parseFloat(v) : 1;
    }
    return 1;
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBehindLive, setIsBehindLive] = useState(false);

  // Reseta índice de fonte ao mudar de canal
  useEffect(() => {
    setSourceIndex(0);
    setErrorMessage(null);
  }, [channel.id]);

  const currentSource: LiveStreamSource | undefined = channel.fontes[sourceIndex];

  // Resolve URL com proxy se a fonte exigir referer ou agente
  const getPlayableUrl = useCallback((source?: LiveStreamSource): string => {
    if (!source) return "";
    if (source.referer || source.agente) {
      const params = new URLSearchParams();
      params.set("url", source.url);
      if (source.referer) params.set("referer", source.referer);
      if (source.agente) params.set("agente", source.agente);
      return `/api/stream-proxy?${params.toString()}`;
    }
    return source.url;
  }, []);

  // Normalização de Áudio com Web Audio API
  const initAudioCompression = useCallback(() => {
    const video = videoRef.current;
    if (!video || audioCtxRef.current) return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const sourceNode = ctx.createMediaElementSource(video);

      // DynamicsCompressor para nivelamento suave
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, ctx.currentTime);
      compressor.knee.setValueAtTime(30, ctx.currentTime);
      compressor.ratio.setValueAtTime(12, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(1.1, ctx.currentTime);

      sourceNode.connect(compressor);
      compressor.connect(gainNode);
      gainNode.connect(ctx.destination);

      audioCtxRef.current = ctx;
    } catch {
      // Navegadores que bloqueiam autoplay/context continuam normalmente
    }
  }, []);

  // Troca para a próxima fonte automaticamente sem travar a interface
  const handleSwitchNextSource = useCallback(() => {
    if (sourceIndex < channel.fontes.length - 1) {
      setIsSwitchingSource(true);
      setErrorMessage(null);
      setSourceIndex((prev) => prev + 1);
      setTimeout(() => setIsSwitchingSource(false), 800);
    } else {
      setErrorMessage("Todas as fontes de transmissão deste canal estão indisponíveis no momento.");
      setIsLoading(false);
    }
  }, [sourceIndex, channel.fontes.length]);

  // Inicializa o motor de vídeo
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentSource) return;

    setIsLoading(true);
    setErrorMessage(null);

    // Destrói instâncias anteriores
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }

    const playableUrl = getPlayableUrl(currentSource);

    if (currentSource.formato === "ts" && mpegts.isSupported()) {
      const player = mpegts.createPlayer({
        type: "mpegts",
        isLive: true,
        url: playableUrl,
      });
      player.attachMediaElement(video);
      player.load();
      player.play().catch(() => {});
      mpegtsRef.current = player;
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 7,
      });

      hls.loadSource(playableUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              handleSwitchNextSource();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              handleSwitchNextSource();
              break;
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playableUrl;
      video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
    };
  }, [currentSource, getPlayableUrl, handleSwitchNextSource]);

  // Sincronia na borda do ao vivo (Zero Delay) a cada 30 segundos
  useEffect(() => {
    const syncInterval = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;

      if (hlsRef.current && hlsRef.current.liveSyncPosition) {
        const livePos = hlsRef.current.liveSyncPosition;
        if (Math.abs(video.currentTime - livePos) > 10) {
          setIsBehindLive(true);
        } else {
          setIsBehindLive(false);
        }
      } else if (video.seekable && video.seekable.length > 0) {
        const liveEdge = video.seekable.end(video.seekable.length - 1);
        if (liveEdge - video.currentTime > 10) {
          setIsBehindLive(true);
        } else {
          setIsBehindLive(false);
        }
      }
    }, 15000);

    return () => clearInterval(syncInterval);
  }, []);

  const jumpToLiveEdge = () => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current && hlsRef.current.liveSyncPosition) {
      video.currentTime = hlsRef.current.liveSyncPosition;
    } else if (video.seekable && video.seekable.length > 0) {
      video.currentTime = video.seekable.end(video.seekable.length - 1) - 1;
    }
    setIsBehindLive(false);
  };

  // Gerenciamento de Visibilidade dos Controles
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3500);
  }, []);

  // Atalhos de Teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "m" || e.key === "M") {
        setMuted((m) => !m);
      } else if (e.key === "f" || e.key === "F") {
        if (!document.fullscreenElement) {
          containerRef.current?.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Volume e Mudo
  const handleVolumeChange = (v: number) => {
    setVolume(v);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
    }
    setMuted(v === 0);
    localStorage.setItem("ydo_live_volume", v.toString());
  };

  const toggleMute = () => {
    initAudioCompression();
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {
      // Ignora erro PiP
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-black flex items-center justify-center overflow-hidden ${className}`}
      onMouseMove={showControls}
      onTouchStart={showControls}
      style={{ cursor: controlsVisible ? "default" : "none" }}
    >
      <video
        ref={videoRef}
        className="w-full h-full block bg-black"
        style={{ objectFit: "contain" }}
        playsInline
        muted={muted}
        onPlaying={() => {
          setIsLoading(false);
          initAudioCompression();
        }}
        onWaiting={() => setIsLoading(true)}
      />

      {/* Loading Skeleton e Aviso Discreto de Troca de Fonte */}
      {(isLoading || isSwitchingSource) && !errorMessage && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-20 gap-3">
          <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-[#e8b44a] animate-spin" />
          <span className="text-xs font-semibold text-white/80 tracking-wide uppercase">
            {isSwitchingSource ? "Alternando para fonte alternativa…" : "Sincronizando sinal ao vivo…"}
          </span>
        </div>
      )}

      {/* Estado de Erro com Botão de Tentativa */}
      {errorMessage && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0b14]/95 p-6 text-center z-30 gap-4">
          <AlertCircle size={44} className="text-[#e8b44a]" />
          <p className="text-sm text-white/70 max-w-sm">{errorMessage}</p>
          <button
            onClick={() => {
              setSourceIndex(0);
              setErrorMessage(null);
            }}
            className="ydo-btn-primary"
            style={{ padding: "8px 20px", fontSize: "0.85rem" }}
          >
            <RefreshCw size={15} /> Tentar Reconectar
          </button>
        </div>
      )}

      {/* Top Bar Translúcida com Dot Pulsante e Nome do Canal */}
      <div
        className={`absolute top-0 left-0 right-0 p-5 bg-gradient-to-b from-black/90 via-black/40 to-transparent flex items-center justify-between z-20 transition-opacity duration-300 pointer-events-none ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Dot "AO VIVO" Pulsante */}
          <button
            onClick={jumpToLiveEdge}
            className={`pointer-events-auto inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold tracking-wider uppercase transition-colors ${
              isBehindLive
                ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                : "bg-[#e8b44a]/20 text-[#e8b44a] border border-[#e8b44a]/30"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#e8b44a] animate-ping" />
            <span>AO VIVO</span>
            {isBehindLive && <span className="text-[10px] opacity-80">(Voltar ao início)</span>}
          </button>

          <span className="text-white font-bold text-base drop-shadow-md">{channel.nome}</span>
        </div>

        {/* Indicador de Categoria */}
        <span className="text-xs px-2.5 py-1 rounded-md bg-white/10 text-white/70 border border-white/10 backdrop-blur-md">
          {channel.categoria}
        </span>
      </div>

      {/* Bottom Bar de Controles */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/95 via-black/60 to-transparent flex items-center justify-between z-20 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Esquerda: Mudo / Volume ("Ao vivo não pausa") */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMute}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-[#e8b44a] hover:bg-white/10 transition-colors"
            aria-label={muted ? "Ativar som" : "Silenciar"}
            title={muted ? "Ativar som (M)" : "Silenciar (M)"}
          >
            {muted || volume === 0 ? <VolumeX size={22} /> : <Volume2 size={22} />}
          </button>

          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            className="w-20 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-[#e8b44a]"
            aria-label="Volume"
          />
        </div>

        {/* Direita: Seletor de Fontes, PiP, Fullscreen */}
        <div className="flex items-center gap-3">
          {/* Seletor Discreto de Fontes (sem exibir URLs) */}
          {channel.fontes.length > 1 && (
            <select
              value={sourceIndex}
              onChange={(e) => setSourceIndex(parseInt(e.target.value))}
              className="bg-black/60 border border-white/20 text-white text-xs font-semibold rounded-lg px-2.5 py-1.5 outline-none hover:border-[#e8b44a] transition-colors cursor-pointer"
              aria-label="Seletor de fonte"
            >
              {channel.fontes.map((f, i) => (
                <option key={i} value={i} className="bg-[#111320] text-white">
                  Fonte {i + 1} {f.qualidade ? `· ${f.qualidade.split(" ")[0]}` : ""}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={togglePiP}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-[#e8b44a] hover:bg-white/10 transition-colors"
            title="Miniplayer (PiP)"
            aria-label="Picture-in-Picture"
          >
            <PictureInPicture size={19} />
          </button>

          <button
            onClick={toggleFullscreen}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-[#e8b44a] hover:bg-white/10 transition-colors"
            title="Tela Cheia (F)"
            aria-label="Tela cheia"
          >
            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}
