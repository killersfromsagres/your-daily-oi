"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";
import { usePlayerEngine } from "./usePlayerEngine";
import { PlayerControls } from "./PlayerControls";
import type { StreamSource } from "@/lib/types";

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

  const [sourceIndex, setSourceIndex] = useState(() => {
    const preferredIdx = streams.findIndex((s) => s.audio === preferredAudio);
    return preferredIdx >= 0 ? preferredIdx : 0;
  });
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasSeekedToInitial, setHasSeekedToInitial] = useState(false);

  const currentStream = streams[sourceIndex] ?? null;

  const handleEnded = useCallback(() => {
    onEnded?.();
  }, [onEnded]);

  const engine = usePlayerEngine(videoRef, currentStream, handleEnded);

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

  // Fullscreen listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
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

  const sources = streams.map((s, i) => ({
    url: s.url,
    audio: s.audio,
    label: `Fonte ${i + 1}`,
  }));

  const handleSourceChange = (i: number) => {
    const prevTime = videoRef.current?.currentTime ?? 0;
    setSourceIndex(i);
    // O useEffect no engine vai reinicializar; preservamos o tempo via initialTime
    setTimeout(() => { if (videoRef.current) videoRef.current.currentTime = prevTime; }, 300);
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
        preload="metadata"
        aria-label={title ?? "Vídeo"}
      />

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

      {/* Erro */}
      {engine.state === "error" && (
        <div className="ydo-player-overlay ydo-player-error-overlay">
          <AlertCircle size={40} aria-hidden />
          <p>{engine.error}</p>
          <div className="ydo-player-error-actions">
            {sourceIndex < streams.length - 1 && (
              <button
                className="ydo-player-error-btn"
                onClick={() => handleSourceChange(sourceIndex + 1)}
              >
                <RefreshCw size={16} /> Tentar próxima fonte
              </button>
            )}
            <button
              className="ydo-player-error-btn ydo-player-error-btn-ghost"
              onClick={() => handleSourceChange(sourceIndex)}
            >
              Tentar novamente
            </button>
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
        />
      </div>
    </div>
  );
}
