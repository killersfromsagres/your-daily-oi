"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, RefreshCw, ArrowLeft, Play, Volume2 } from "lucide-react";
import { usePlayerEngine } from "./usePlayerEngine";
import { PlayerControls } from "./PlayerControls";
import type { StreamSource } from "@/lib/types";
import { recordFailedSource, sortStreamsByHealth, clearFailedSources } from "@/lib/player-storage";
import { APP_VERSION } from "@/lib/version";

interface OwnPlayerProps {
  streams: StreamSource[];
  poster?: string;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  initialTime?: number;
  onTimeUpdate?: (t: number) => void;
  onEnded?: () => void;
  preferredAudio?: "dub" | "leg";
}

// 4b: Ordem de tentativa por tipo de relay
const getPreferredAttemptIsProxy = (url: string): boolean => {
  if (!url) return false;
  // Mixed content: qualquer http:// em página https:// deve ir via proxy
  if (url.startsWith("http://")) {
    return true;
  }
  // Relay de filmes do Saimo: proxy primeiro (hotlink Referer protection do CDN)
  if (url.includes("saimo-tv.pages.dev/api/stream") && url.includes("tipo=movie")) {
    return true;
  }
  // CDNs conhecidos que exigem proxy por CORS ou Referer
  if (
    url.includes("hermesnewone.com") ||
    url.includes("workers.dev") ||
    url.includes("tech-cdn.top")
  ) {
    return true;
  }
  // Relay tipo=series (séries/animes): direto primeiro (o relay recusa servidor; a tentativa deve sair do navegador real), proxy como retentativa
  if (url.includes("saimo-tv.pages.dev/api/stream") && url.includes("tipo=series")) {
    return false;
  }
  // Demais fontes (Internet Archive, MP4s diretos): direto primeiro, proxy como retentativa
  return false;
};

const getStreamUrlForStage = (rawUrl: string, stage: 0 | 1): string => {
  if (!rawUrl) return "";
  if (rawUrl.includes("/api/proxy-stream")) return rawUrl;
  const preferredIsProxy = getPreferredAttemptIsProxy(rawUrl);
  const useProxy = stage === 0 ? preferredIsProxy : !preferredIsProxy;
  if (useProxy) {
    return `/api/proxy-stream?url=${encodeURIComponent(rawUrl)}`;
  }
  return rawUrl;
};

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
}: OwnPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const orderedStreams = useMemo(() => sortStreamsByHealth(streams), [streams]);

  const [sourceIndex, setSourceIndex] = useState(() => {
    const preferredIdx = orderedStreams.findIndex((s) => s.audio === preferredAudio);
    return preferredIdx >= 0 ? preferredIdx : 0;
  });
  const [attemptStage, setAttemptStage] = useState<0 | 1>(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasSeekedToInitial, setHasSeekedToInitial] = useState(false);
  const [autoSwitchMsg, setAutoSwitchMsg] = useState<string | null>(null);

  const lastTimeRef = useRef(initialTime);

  useEffect(() => {
    console.info(`[Zang Flix Player] build ${APP_VERSION.version} (${APP_VERSION.commit})`);
  }, []);

  const rawStream = orderedStreams[sourceIndex] ?? null;

  // Cada fonte tenta o caminho preferido (stage 0) e depois o outro (stage 1), mantendo currentTime
  const currentStream: StreamSource | null = useMemo(() => {
    if (!rawStream) return null;
    return {
      ...rawStream,
      url: getStreamUrlForStage(rawStream.url, attemptStage),
    };
  }, [rawStream, attemptStage]);

  const handleEnded = useCallback(() => {
    onEnded?.();
  }, [onEnded]);

  // TDZ SAFE: Declarado antes de qualquer useEffect/handler que o cite
  const engine = usePlayerEngine(videoRef, currentStream, handleEnded);

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

  // Chaveamento inteligente:
  // 1. Tenta o caminho preferencial da fonte (direto ou proxy dependendo do tipo)
  // 2. Se falhar, retenta a mesma fonte no caminho inverso preservando currentTime
  // 3. Se ambos falharem, registra falha e avança para a próxima fonte
  useEffect(() => {
    if (engine.state === "error" && rawStream) {
      if (attemptStage === 0) {
        console.warn(`[OwnPlayer] Falha no caminho inicial para ${rawStream.url}. Retentando caminho alternativo...`);
        setAttemptStage(1);
        return;
      }

      // Ambos os caminhos falharam para esta fonte: registra falha e avança
      recordFailedSource(rawStream.url);
      setAttemptStage(0);

      if (sourceIndex < orderedStreams.length - 1) {
        setAutoSwitchMsg("Trocando de servidor…");
        const timer = setTimeout(() => {
          setSourceIndex((prev) => prev + 1);
          setAutoSwitchMsg(null);
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [engine.state, rawStream, attemptStage, sourceIndex, orderedStreams.length]);

  // Timeout de 12s para evitar qualquer travamento em "Preparando reprodução..."
  useEffect(() => {
    if (engine.state !== "loading" && engine.state !== "idle") return;
    if (!rawStream) return;

    const timeout = setTimeout(() => {
      console.warn(`[Zang Flix Player] Timeout de 12s atingido para a fonte ${rawStream.url}`);
      if (attemptStage === 0) {
        setAttemptStage(1);
      } else {
        recordFailedSource(rawStream.url);
        setAttemptStage(0);
        if (sourceIndex < orderedStreams.length - 1) {
          setAutoSwitchMsg("Fonte lenta, alternando servidor…");
          setSourceIndex((prev) => prev + 1);
          setTimeout(() => setAutoSwitchMsg(null), 1000);
        }
      }
    }, 12000);

    return () => clearTimeout(timeout);
  }, [engine.state, rawStream, attemptStage, sourceIndex, orderedStreams.length]);

  const handleVideoClick = () => {
    if (engine.muted) {
      engine.setMuted(false);
    }
    if (engine.state === "playing") {
      engine.pause();
    } else {
      void engine.play();
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
    onTimeUpdate?.(engine.currentTime);
  }, [engine.currentTime]);

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
      if (e.key === " " || e.key === "k") { e.preventDefault(); engine.state === "playing" ? engine.pause() : void engine.play(); }
      if (e.key === "ArrowRight") { e.preventDefault(); engine.seek(engine.currentTime + 10); }
      if (e.key === "ArrowLeft") { e.preventDefault(); engine.seek(engine.currentTime - 10); }
      if (e.key === "m") engine.setMuted(!engine.muted);
      if (e.key === "f") engine.requestFullscreen();
      showControls();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [engine]);

  const sources = orderedStreams.map((s, i) => ({
    url: s.url,
    audio: s.audio,
    label: s.name || `Fonte ${i + 1} (${s.audio.toUpperCase()})`,
  }));

  const handleSourceChange = (i: number) => {
    const prevTime = videoRef.current?.currentTime ?? 0;
    setSourceIndex(i);
    setUseProxyFallback(false);
    setAutoSwitchMsg(null);
    setTimeout(() => {
      if (videoRef.current && prevTime > 0) {
        videoRef.current.currentTime = prevTime;
      }
    }, 300);
  };

  const handleOverlayClick = () => {
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
            Os servidores deste título estão fora do ar agora
          </h3>
          <p style={{ color: "rgba(255, 255, 255, 0.7)", maxWidth: "460px", margin: "0 auto 18px", fontSize: "0.95rem" }}>
            Tentamos todas as fontes disponíveis no momento. A disponibilidade pode retornar em breve.
          </p>
          <div className="ydo-player-error-actions">
            <button
              className="ydo-btn-primary"
              onClick={() => {
                clearFailedSources();
                setSourceIndex(0);
                setUseProxyFallback(false);
                setAutoSwitchMsg(null);
              }}
            >
              <RefreshCw size={16} /> Tentar de novo
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
          onPlay={() => void engine.play()}
          onPause={engine.pause}
          onSeek={engine.seek}
          onVolume={engine.setVolume}
          onMute={() => engine.setMuted(!engine.muted)}
          onFullscreen={engine.requestFullscreen}
          onPiP={() => void engine.requestPiP()}
          onRate={engine.setPlaybackRate}
          onSourceChange={handleSourceChange}
          onCast={engine.castToTv}
        />
      </div>
    </div>
  );
}
