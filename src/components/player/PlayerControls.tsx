"use client";
import { useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  PictureInPicture,
  Settings,
  SkipForward,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import type { PlayerState } from "./usePlayerEngine";

function formatTime(s: number): string {
  if (!s || !isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${ss}`;
  }
  return `${m}:${ss}`;
}

interface PlayerControlsProps {
  state: PlayerState;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  isFullscreen: boolean;
  sources: Array<{ url: string; audio: string; label: string }>;
  currentSourceIndex: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (t: number) => void;
  onVolume: (v: number) => void;
  onMute: () => void;
  onFullscreen: () => void;
  onPiP: () => void;
  onRate: (r: number) => void;
  onSourceChange: (i: number) => void;
  onNext?: () => void;
}

export function PlayerControls({
  state,
  currentTime,
  duration,
  buffered,
  volume,
  muted,
  playbackRate,
  isFullscreen,
  sources,
  currentSourceIndex,
  onPlay,
  onPause,
  onSeek,
  onVolume,
  onMute,
  onFullscreen,
  onPiP,
  onRate,
  onSourceChange,
  onNext,
}: PlayerControlsProps) {
  const [showSettings, setShowSettings] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  const isPlaying = state === "playing";
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const buffPct = duration > 0 ? (buffered / duration) * 100 : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect || !duration) return;
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(duration, pct * duration)));
  };

  return (
    <div className="ydo-controls">
      {/* Barra de progresso interativa com preview */}
      <div
        ref={progressRef}
        className="ydo-progress"
        role="slider"
        aria-label="Progresso do vídeo"
        aria-valuenow={Math.round(currentTime)}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        tabIndex={0}
        onClick={handleProgressClick}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onSeek(currentTime + 10);
          if (e.key === "ArrowLeft") onSeek(currentTime - 10);
        }}
      >
        <div className="ydo-progress-buffered" style={{ width: `${buffPct}%` }} />
        <div className="ydo-progress-played" style={{ width: `${progress}%` }}>
          <div className="ydo-progress-thumb" />
        </div>
      </div>

      {/* Linha de Controles Inferiores (Estilo Cinema Saimo / Netflix) */}
      <div className="ydo-controls-row">
        {/* Esquerda: Play/Pause, 10s back/forward, Volume, Time, 2K/HD */}
        <div className="ydo-controls-left">
          <button
            className="ydo-ctrl-btn ydo-ctrl-btn-play"
            onClick={isPlaying ? onPause : onPlay}
            aria-label={isPlaying ? "Pausar" : "Reproduzir"}
          >
            {isPlaying ? (
              <Pause size={24} fill="currentColor" />
            ) : (
              <Play size={24} fill="currentColor" />
            )}
          </button>

          {/* Retroceder 10s */}
          <button
            className="ydo-ctrl-btn"
            onClick={() => onSeek(Math.max(0, currentTime - 10))}
            aria-label="Voltar 10 segundos"
            title="Voltar 10s"
          >
            <RotateCcw size={20} />
            <span style={{ fontSize: "0.6rem", position: "absolute", fontWeight: "800", marginTop: "2px" }}>10</span>
          </button>

          {/* Avançar 10s */}
          <button
            className="ydo-ctrl-btn"
            onClick={() => onSeek(Math.min(duration, currentTime + 10))}
            aria-label="Avançar 10 segundos"
            title="Avançar 10s"
          >
            <RotateCw size={20} />
            <span style={{ fontSize: "0.6rem", position: "absolute", fontWeight: "800", marginTop: "2px" }}>10</span>
          </button>

          {onNext && (
            <button className="ydo-ctrl-btn" onClick={onNext} aria-label="Próximo episódio" title="Próximo Episódio">
              <SkipForward size={20} />
            </button>
          )}

          {/* Controle de Volume */}
          <div className="ydo-volume-group">
            <button className="ydo-ctrl-btn" onClick={onMute} aria-label={muted ? "Ativar som" : "Silenciar"}>
              {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => onVolume(Number(e.target.value))}
              className="ydo-volume-slider"
              aria-label="Volume"
            />
          </div>

          {/* Tempo Decorrido / Duração + Badge 2K/HD */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "6px" }}>
            <span className="ydo-time tabular">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <span style={{
              fontSize: "0.65rem",
              fontWeight: "800",
              padding: "2px 6px",
              borderRadius: "4px",
              backgroundColor: "rgba(255, 255, 255, 0.15)",
              color: "#fff",
              letterSpacing: "0.05em",
            }}>
              2K
            </span>
          </div>
        </div>

        {/* Direita: Fontes / Servidores, Velocidade, PiP, Fullscreen */}
        <div className="ydo-controls-right">
          {/* Seletor de Fontes / Servidores */}
          {sources.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <select
                className="ydo-source-select"
                value={currentSourceIndex}
                onChange={(e) => onSourceChange(Number(e.target.value))}
                aria-label="Selecionar servidor"
                style={{
                  backgroundColor: "rgba(20, 22, 34, 0.85)",
                  color: "#fff",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "8px",
                  padding: "4px 8px",
                  fontSize: "0.8rem",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                {sources.map((s, i) => (
                  <option key={i} value={i} style={{ backgroundColor: "#111320", color: "#fff" }}>
                    {s.label} ({s.audio.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Menu de Configurações (Velocidade) */}
          <div className="ydo-settings-wrap" style={{ position: "relative" }}>
            <button
              className="ydo-ctrl-btn"
              onClick={() => setShowSettings((v) => !v)}
              aria-label="Configurações"
              aria-expanded={showSettings}
              title="Velocidade"
            >
              <Settings size={20} />
            </button>
            {showSettings && (
              <div className="ydo-settings-panel" style={{
                position: "absolute",
                bottom: "45px",
                right: 0,
                backgroundColor: "#161826",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "12px",
                padding: "12px",
                minWidth: "160px",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.7)",
                zIndex: 40,
              }}>
                <div style={{ fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.6)", marginBottom: "8px", fontWeight: "700" }}>
                  VELOCIDADE
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                    <button
                      key={r}
                      style={{
                        padding: "6px 8px",
                        borderRadius: "6px",
                        fontSize: "0.8rem",
                        fontWeight: "700",
                        border: playbackRate === r ? "1px solid #e8b44a" : "1px solid rgba(255,255,255,0.08)",
                        backgroundColor: playbackRate === r ? "rgba(232, 180, 74, 0.2)" : "rgba(255,255,255,0.04)",
                        color: playbackRate === r ? "#e8b44a" : "#fff",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        onRate(r);
                        setShowSettings(false);
                      }}
                    >
                      {r}×
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Picture in Picture */}
          <button className="ydo-ctrl-btn" onClick={onPiP} aria-label="Picture in Picture" title="Miniplayer (PiP)">
            <PictureInPicture size={20} />
          </button>

          {/* Fullscreen */}
          <button
            className="ydo-ctrl-btn"
            onClick={onFullscreen}
            aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            title="Tela Cheia"
          >
            {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
          </button>
        </div>
      </div>
    </div>
  );
}
