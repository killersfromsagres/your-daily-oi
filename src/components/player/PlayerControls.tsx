"use client";
import { useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, PictureInPicture, Settings, SkipForward } from "lucide-react";
import type { PlayerState } from "./usePlayerEngine";

function formatTime(s: number): string {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
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
  state, currentTime, duration, buffered, volume, muted,
  playbackRate, isFullscreen, sources, currentSourceIndex,
  onPlay, onPause, onSeek, onVolume, onMute, onFullscreen,
  onPiP, onRate, onSourceChange, onNext,
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
      {/* Barra de progresso */}
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

      {/* Controles inferiores */}
      <div className="ydo-controls-row">
        {/* Esquerda */}
        <div className="ydo-controls-left">
          <button
            className="ydo-ctrl-btn"
            onClick={isPlaying ? onPause : onPlay}
            aria-label={isPlaying ? "Pausar" : "Reproduzir"}
          >
            {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>

          {onNext && (
            <button className="ydo-ctrl-btn" onClick={onNext} aria-label="Próximo episódio">
              <SkipForward size={20} />
            </button>
          )}

          {/* Volume */}
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

          <span className="ydo-time tabular">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Direita */}
        <div className="ydo-controls-right">
          {/* Fonte */}
          {sources.length > 1 && (
            <select
              className="ydo-source-select"
              value={currentSourceIndex}
              onChange={(e) => onSourceChange(Number(e.target.value))}
              aria-label="Selecionar fonte"
            >
              {sources.map((s, i) => (
                <option key={i} value={i}>
                  {s.label} ({s.audio.toUpperCase()})
                </option>
              ))}
            </select>
          )}

          {/* Configurações */}
          <div className="ydo-settings-wrap">
            <button
              className="ydo-ctrl-btn"
              onClick={() => setShowSettings((v) => !v)}
              aria-label="Configurações"
              aria-expanded={showSettings}
            >
              <Settings size={18} />
            </button>
            {showSettings && (
              <div className="ydo-settings-panel">
                <div className="ydo-settings-group">
                  <span>Velocidade</span>
                  <div className="ydo-rate-btns">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                      <button
                        key={r}
                        className={`ydo-rate-btn${playbackRate === r ? " active" : ""}`}
                        onClick={() => { onRate(r); setShowSettings(false); }}
                      >
                        {r}×
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button className="ydo-ctrl-btn" onClick={onPiP} aria-label="Picture in Picture">
            <PictureInPicture size={18} />
          </button>

          <button className="ydo-ctrl-btn" onClick={onFullscreen} aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}>
            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}
