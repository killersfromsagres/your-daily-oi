"use client";
import { fullscreenProgressFraction } from "@/lib/fullscreen-orientation";
import { useEffect, useRef, useState } from "react";
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
  Cast,
  Server,
  ChevronDown,
  ChevronUp,
  Check,
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
  rotatedLandscape?: boolean;
  sources: Array<{ name: string; audio: string; quality?: string; format?: string }>;
  currentSourceIndex: number;
  detectedQuality?: string;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (t: number) => void;
  onVolume: (v: number) => void;
  onMute: () => void;
  onFullscreen: () => void;
  onPiP: () => void;
  onRate: (r: number) => void;
  onSourceChange: (i: number) => void;
  onCast?: () => void;
  onNext?: () => void;
  hqSupported?: boolean;
  hqActive?: boolean;
  hqMode?: "ai" | "loading" | "shader" | "native";
  onToggleHq?: () => void;
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
  rotatedLandscape = false,
  sources,
  currentSourceIndex,
  detectedQuality,
  onPlay,
  onPause,
  onSeek,
  onVolume,
  onMute,
  onFullscreen,
  onPiP,
  onRate,
  onSourceChange,
  onCast,
  onNext,
  hqSupported,
  hqActive,
  hqMode = "ai",
  onToggleHq,
}: PlayerControlsProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showServers, setShowServers] = useState(false);
  const serversRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showServers) return;
    const handleDown = (e: MouseEvent | TouchEvent) => {
      if (serversRef.current && !serversRef.current.contains(e.target as Node)) {
        setShowServers(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowServers(false);
    };
    document.addEventListener("pointerdown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showServers]);

  const isPlaying = state === "playing";
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const buffPct = duration > 0 ? (buffered / duration) * 100 : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect || !duration) return;
    const pct = fullscreenProgressFraction({clientX:e.clientX,clientY:e.clientY,rotated:rotatedLandscape,rect});
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

      {/* Controles inferiores minimalistas do ZANG FLIX */}
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

          {/* Tempo Decorrido / Duração + Badge de Resolução Real */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "6px" }}>
            <span className="ydo-time tabular">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            {(() => {
              const effectiveQuality = (
                detectedQuality ||
                sources[currentSourceIndex]?.quality ||
                "1080p"
              ).toUpperCase();
              const is4k = effectiveQuality.includes("4K");
              return (
                <span
                  className="ydo-2k-badge"
                  title={`Qualidade real: ${effectiveQuality}`}
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: "800",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    backgroundColor: is4k ? "rgba(232, 180, 74, 0.25)" : "rgba(255, 255, 255, 0.15)",
                    color: is4k ? "#e8b44a" : "#fff",
                    border: is4k ? "1px solid rgba(232, 180, 74, 0.4)" : "1px solid rgba(255, 255, 255, 0.15)",
                    letterSpacing: "0.05em",
                  }}
                >
                  {effectiveQuality}
                </span>
              );
            })()}
          </div>
        </div>

        {/* Direita: Fontes / Servidores, Velocidade, PiP, Fullscreen */}
        <div className="ydo-controls-right">
          {/* Seleção automática: mostrar somente as fontes utilizáveis e únicas. */}
          {sources.length > 1 && (
            <div className="ydo-source-wrap zf-server-selector" ref={serversRef}>
              <button
                type="button"
                className="ydo-source-trigger zf-server-trigger"
                onClick={() => {
                  setShowServers(previous => !previous);
                  if (showSettings) setShowSettings(false);
                }}
                aria-expanded={showServers}
                aria-haspopup="listbox"
                aria-label="Selecionar servidor de reprodução"
              >
                <Server size={15} aria-hidden="true" />
                <span className="zf-server-trigger-name">Servidor {String(currentSourceIndex + 1).padStart(2,"0")}</span>
                <span className="zf-server-trigger-audio">{sources[currentSourceIndex]?.audio === "dub" ? "DUB" : "LEG"}</span>
                {showServers ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
              </button>
              {showServers && (
                <div className="ydo-source-panel zf-server-panel">
                  <div className="zf-server-panel-heading">
                    <span>Servidores de reprodução</span>
                    <small>Seleção inteligente · dublado primeiro</small>
                  </div>
                  <div className="zf-server-list" role="listbox" aria-label="Servidores disponíveis">
                    {sources.map((s, i) => {
                      const isActive = i === currentSourceIndex;
                      const quality = isActive && detectedQuality && detectedQuality !== "Auto"
                        ? detectedQuality : s.quality;
                      return (
                        <button
                          key={i}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={"zf-server-option" + (isActive ? " is-current" : "")}
                          onClick={() => {
                            onSourceChange(i);
                            setShowServers(false);
                          }}
                        >
                          <span className="zf-server-number">{String(i + 1).padStart(2,"0")}</span>
                          <span className="zf-server-information">
                            <strong>{isActive ? "Em reprodução" : "Servidor " + String(i + 1).padStart(2,"0")}</strong>
                            <small>{s.audio === "dub" ? "Português dublado" : "Legendado"}</small>
                          </span>
                          <span className="zf-server-resolution">
                            {quality && quality !== "Auto" ? quality : "A verificar"}
                          </span>
                          {isActive && <Check size={16} aria-hidden="true" className="zf-server-current-icon" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="zf-server-panel-footer">
                    <span>{sources.length} alternativas selecionadas</span>
                    <span>Troca automática em caso de falha</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Neural IA 2x when WebGPU is available; WebGL HQ is visibly labeled. */}
          {hqSupported && (
            <button
              onClick={onToggleHq}
              className={`ydo-ctrl-btn ydo-hq-btn ${hqActive ? "active" : ""}`}
              data-mode={hqMode}
              aria-busy={Boolean(hqActive && hqMode === "loading")}
              title={!hqActive ? "HQ · melhorar imagem" : hqMode === "loading" ? "HQ · preparando aprimoramento" : hqMode === "ai" ? "HQ ativo · super-resolução por IA 2×" : hqMode === "native" ? "HQ compatível · ajuste visual leve" : "HQ ativo · nitidez adaptativa"}
              aria-label="Ativar ou desativar melhoria de imagem HQ"
              aria-pressed={Boolean(hqActive)}
            >
              <span className="zf-hq-symbol" aria-hidden="true"><span>HQ</span></span>
              <span className="zf-hq-indicator" aria-hidden="true"/>
            </button>
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

          {/* Espelhar na TV / Transmitir */}
          {onCast && (
            <button
              className="ydo-ctrl-btn ydo-cast-btn"
              onClick={onCast}
              aria-label="Espelhar na TV"
              title="Espelhar na TV (Chromecast / AirPlay)"
            >
              <Cast size={20} />
            </button>
          )}

          {/* Picture in Picture */}
          <button className="ydo-ctrl-btn ydo-pip-btn" onClick={onPiP} aria-label="Picture in Picture" title="Miniplayer (PiP)">
            <PictureInPicture size={20} />
          </button>

          {/* Fullscreen */}
          <button
            className="ydo-ctrl-btn ydo-ctrl-btn-fullscreen"
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
