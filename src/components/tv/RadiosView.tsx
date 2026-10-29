"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import type { RadioItem } from "@/lib/canais";
import {
  Radio,
  Search,
  Play,
  Pause,
  Volume2,
  VolumeX,
  X,
  Tv,
  Layers,
} from "lucide-react";

export function RadiosView() {
  const [radios, setRadios] = useState<RadioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [activeRadio, setActiveRadio] = useState<RadioItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch("/api/radios", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ radios: RadioItem[] }>;
      })
      .then((data) => {
        if (!active) return;
        setRadios(data.radios);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredRadios = useMemo(() => {
    if (!searchQuery.trim()) return radios;
    const q = searchQuery.toLowerCase().trim();
    return radios.filter((r) => r.nome.toLowerCase().includes(q));
  }, [radios, searchQuery]);

  const togglePlayRadio = useCallback(
    (radio: RadioItem) => {
      if (activeRadio?.id === radio.id) {
        if (isPlaying) {
          audioRef.current?.pause();
          setIsPlaying(false);
        } else {
          void audioRef.current?.play().then(() => setIsPlaying(true));
        }
      } else {
        setActiveRadio(radio);
        setIsPlaying(true);
      }
    },
    [activeRadio, isPlaying]
  );

  useEffect(() => {
    if (!activeRadio) return;
    const audio = audioRef.current;
    if (!audio) return;

    audio.src = activeRadio.url;
    audio.volume = volume;
    audio.muted = muted;
    void audio.play().then(
      () => setIsPlaying(true),
      () => setIsPlaying(false)
    );
  }, [activeRadio]);

  const handleMuteToggle = () => {
    if (!audioRef.current) return;
    const next = !audioRef.current.muted;
    audioRef.current.muted = next;
    setMuted(next);
  };

  const handleVolumeChange = (v: number) => {
    if (!audioRef.current) return;
    audioRef.current.volume = v;
    setVolume(v);
    if (v > 0 && muted) {
      audioRef.current.muted = false;
      setMuted(false);
    }
  };

  return (
    <main className="ydo-tv-page">
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => setIsPlaying(false)}
      />

      <div className="ydo-tv-subnav">
        <div className="ydo-tv-subnav-left">
          <h1 className="ydo-tv-main-title">
            <Radio size={22} style={{ color: "#e8b44a" }} />
            <span>Rádios Online</span>
          </h1>
          <span className="ydo-tv-badge-live">
            <span className="ydo-live-dot" />
            {radios.length} Emissoras
          </span>
        </div>

        <div className="ydo-tv-subnav-links">
          <Link to="/tv" className="ydo-tv-sublink">
            <Tv size={14} />
            <span>Canais de TV</span>
          </Link>
          <Link to="/tv/radios" className="ydo-tv-sublink active">
            <Radio size={14} />
            <span>Rádios Online</span>
          </Link>
        </div>
      </div>

      <div className="ydo-radios-page">
        {/* Barra de Busca de Rádios */}
        <div style={{ maxWidth: 440, margin: "0 0 24px" }} className="ydo-tv-search-box">
          <Search size={15} className="ydo-tv-search-icon" aria-hidden />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar emissora de rádio…"
            className="ydo-tv-search-input"
            aria-label="Buscar rádio"
          />
        </div>

        {/* Grade Responsiva de Rádios */}
        <div className="ydo-radios-grid">
          {loading && radios.length === 0 ? (
            Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="ydo-radio-card skeleton" style={{ height: 68 }} />
            ))
          ) : filteredRadios.length === 0 ? (
            <div style={{ gridColumn: "1 / -1", padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
              Nenhuma emissora de rádio encontrada.
            </div>
          ) : (
            filteredRadios.map((r) => {
              const isCurrent = activeRadio?.id === r.id;
              const isCurrentPlaying = isCurrent && isPlaying;

              return (
                <div
                  key={r.id}
                  className={`ydo-radio-card ${isCurrent ? "active" : ""}`}
                >
                  <div className="ydo-radio-logo-wrap">
                    {r.logo ? (
                      <img
                        src={r.logo}
                        alt=""
                        loading="lazy"
                        className="ydo-radio-logo-img"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <Radio size={20} style={{ color: "rgba(255,255,255,0.4)" }} />
                    )}
                  </div>

                  <div className="ydo-radio-info">
                    <div className="ydo-radio-title">{r.nome}</div>
                    <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
                      {isCurrentPlaying ? "Tocando agora…" : "Transmissão ao vivo"}
                    </span>
                  </div>

                  <button
                    onClick={() => togglePlayRadio(r)}
                    className="ydo-radio-play-btn"
                    aria-label={isCurrentPlaying ? `Pausar ${r.nome}` : `Tocar ${r.nome}`}
                  >
                    {isCurrentPlaying ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Barra de Áudio Fixa no Rodapé quando uma rádio estiver sintonizada */}
      {activeRadio && (
        <div className="ydo-radio-bottom-bar animate-fade-in">
          <div className="ydo-radio-bar-left">
            <div className="ydo-radio-logo-wrap" style={{ width: 36, height: 36 }}>
              {activeRadio.logo ? (
                <img src={activeRadio.logo} alt="" className="ydo-radio-logo-img" />
              ) : (
                <Radio size={16} style={{ color: "#e8b44a" }} />
              )}
            </div>
            <div>
              <div className="ydo-radio-bar-name">{activeRadio.nome}</div>
              <div style={{ fontSize: "0.7rem", color: "#e8b44a", fontWeight: 700 }}>AO VIVO</div>
            </div>
          </div>

          <div className="ydo-radio-bar-right">
            <button
              onClick={() => togglePlayRadio(activeRadio)}
              className="ydo-radio-play-btn"
              style={{ width: 38, height: 38 }}
              aria-label={isPlaying ? "Pausar rádio" : "Continuar rádio"}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
            </button>

            <div className="ydo-live-volume-wrap">
              <button onClick={handleMuteToggle} className="ydo-live-ctrl-btn">
                {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="ydo-live-volume-slider"
                style={{ width: 60 }}
              />
            </div>

            <button
              onClick={() => {
                audioRef.current?.pause();
                setActiveRadio(null);
                setIsPlaying(false);
              }}
              className="ydo-live-ctrl-btn"
              title="Fechar tocador"
            >
              <X size={17} />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
