"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { JogoBrasileirao } from "@/lib/jogos";
import { Trophy, Tv } from "lucide-react";

interface JogosShelfProps {
  onSelectCanalId: (canalId: string) => void;
}

function isJogoAoVivo(inicioIso: string): boolean {
  if (!inicioIso) return false;
  const start = new Date(inicioIso).getTime();
  if (isNaN(start)) return false;
  const now = Date.now();
  // Partida de futebol tem ~105 minutos de duração (90 min + intervalo + acréscimos)
  return now >= start && now < start + 105 * 60 * 1000;
}

function EscudoTime({ src, nome }: { src?: string; nome: string }) {
  const [failed, setFailed] = useState(false);
  const initials = (nome || "TIM").slice(0, 3).toUpperCase();

  if (!src || failed) {
    return (
      <div className="ydo-jogos-escudo-fallback" aria-hidden="true">
        <span>{initials}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={nome}
      loading="lazy"
      onError={() => setFailed(true)}
      className="ydo-jogos-escudo-img"
    />
  );
}

function CanalBadge({ logo, nome }: { logo?: string | null; nome?: string | null }) {
  const [failed, setFailed] = useState(false);
  const initials = (nome || "TV").slice(0, 2).toUpperCase();

  return (
    <div className="ydo-jogos-canal-info">
      {logo && !failed ? (
        <img
          src={logo}
          alt={nome || "Canal"}
          loading="lazy"
          onError={() => setFailed(true)}
          className="ydo-jogos-canal-logo"
        />
      ) : (
        <span className="ydo-jogos-canal-monogram">{initials}</span>
      )}
      <span className="ydo-jogos-canal-nome">{nome || "Ao Vivo"}</span>
    </div>
  );
}

export function JogosShelf({ onSelectCanalId }: JogosShelfProps) {
  const navigate = useNavigate();
  const [jogos, setJogos] = useState<JogoBrasileirao[]>([]);

  useEffect(() => {
    let active = true;

    const fetchJogos = () => {
      fetch("/api/jogos-hoje", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { jogos?: JogoBrasileirao[] } | null) => {
          if (!active) return;
          setJogos(data?.jogos || []);
        })
        .catch(() => {});
    };

    fetchJogos();
    const interval = setInterval(fetchJogos, 30 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (jogos.length === 0) return null;

  const hasAoVivo = jogos.some((j) => isJogoAoVivo(j.inicioIso));

  const handleClick = (j: JogoBrasileirao) => {
    if (j.canalId) {
      onSelectCanalId(j.canalId);
    } else {
      void navigate({ to: "/tv", replace: true });
    }
  };

  return (
    <section className="ydo-jogos-shelf" aria-label="Jogos de Hoje">
      <div className="ydo-jogos-header">
        <div className="ydo-jogos-title-wrap">
          <Trophy size={18} style={{ color: "#e8b44a" }} />
          <h2 className="ydo-jogos-title">Jogos de Hoje</h2>
          <span className="ydo-jogos-badge-liga">BRASILEIRÃO</span>
          {hasAoVivo && (
            <span className="ydo-jogos-badge-live">
              <span className="ydo-live-dot" />
              AO VIVO
            </span>
          )}
        </div>
      </div>

      <div className="ydo-tv-shelf-track ydo-jogos-track">
        {jogos.map((j) => {
          const aoVivo = isJogoAoVivo(j.inicioIso);
          return (
            <div
              key={j.id}
              role="button"
              tabIndex={0}
              onClick={() => handleClick(j)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClick(j);
                }
              }}
              className={`ydo-jogos-card ${aoVivo ? "is-live" : ""}`}
              aria-label={`${j.casa} contra ${j.fora}, horário ${j.horarioLocal}${j.canalNome ? `, transmissão ${j.canalNome}` : ""}`}
            >
              {/* Topo do card: Rodada + Selo AO VIVO se em andamento */}
              <div className="ydo-jogos-card-top">
                <span className="ydo-jogos-card-round">{j.rodada || "Brasileirão"}</span>
                {aoVivo ? (
                  <span className="ydo-jogos-live-pill">
                    <span className="ydo-live-dot" />
                    AO VIVO
                  </span>
                ) : (
                  <span className="ydo-jogos-time-badge">{j.horarioLocal}</span>
                )}
              </div>

              {/* Confronto com Escudos e 'x' dourado */}
              <div className="ydo-jogos-confronto">
                <div className="ydo-jogos-time">
                  <EscudoTime src={j.escudoCasa} nome={j.casa} />
                  <span className="ydo-jogos-nome-time" title={j.casa}>
                    {j.casa}
                  </span>
                </div>

                <div className="ydo-jogos-versus">
                  <span className="ydo-jogos-x">x</span>
                </div>

                <div className="ydo-jogos-time">
                  <EscudoTime src={j.escudoFora} nome={j.fora} />
                  <span className="ydo-jogos-nome-time" title={j.fora}>
                    {j.fora}
                  </span>
                </div>
              </div>

              {/* Rodapé: Canal de Transmissão */}
              <div className="ydo-jogos-card-footer">
                <CanalBadge logo={j.canalLogo} nome={j.canalNome} />
                <Tv size={14} className="ydo-jogos-tv-icon" />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
