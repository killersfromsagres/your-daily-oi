"use client";
// src/components/sports/TeamLineupBoard.tsx — one-team portrait football lineup.
import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import type { LineupPlayer, LineupTeam } from "@/lib/football-lineups";
import { buildTacticalLayout, positionBadge, POSITION_SECTORS } from "@/lib/lineup-tactics";

function Photo({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setFailed(false); setLoaded(false); }, [src]);
  const initials=name.split(" ").filter(Boolean).slice(-2).map(part=>part.charAt(0)).join("").toUpperCase()||"?";
  return (
    <span className="zf-formation-portrait">
      <span className="zf-formation-photo-fallback" aria-hidden="true">{initials}</span>
      {src && !failed && (
        <img src={src} alt={name} loading="lazy" decoding="async"
          className={loaded?"is-loaded":""}
          onLoad={event=>{
            if(event.currentTarget.naturalWidth>4)setLoaded(true);
            else setFailed(true);
          }}
          onError={() => setFailed(true)}/>
      )}
    </span>
  );
}
function Player({ player }: { player: LineupPlayer }) {
  const role = positionBadge(player);
  return (
    <div className="zf-formation-player" data-sector={role.group} data-position={role.code} data-player-id={player.id} title={role.label + " · " + player.position}>
      <Photo name={player.name} src={player.photo}/>
      <strong>{player.number && <span>{player.number} </span>}{player.name}</strong>
      <small className="zf-formation-role" aria-label={role.label}>
        <span className="zf-position-orb" aria-hidden="true"/>{role.code}
      </small>
    </div>
  );
}
export function TeamLineupBoard({ team }: { team: LineupTeam }) {
  const layout = buildTacticalLayout(team);
  return (
    <div className="zf-formation-content">
      <div className="zf-formation-legend" aria-label="Cores das posições">
        {POSITION_SECTORS.map(({ group, label }) => <span key={group} data-sector={group}>
          <span className="zf-position-orb" aria-hidden="true"/>{label}
        </span>)}
      </div>
      <div className="zf-formation-pitch" data-layout={layout.source} aria-label={"Campo tático: escalação de " + team.name}>
        <span className="zf-formation-top-box" aria-hidden="true" />
        <span className="zf-formation-center-line" aria-hidden="true" />
        <span className="zf-formation-center-circle" aria-hidden="true" />
        <span className="zf-formation-watermark" aria-hidden="true">ZANG <b>FLIX</b></span>
        <div className="zf-formation-players" style={{ gridTemplateRows: `repeat(${layout.rows.length || 1}, minmax(100px, 1fr))` }}>
          {layout.rows.map((row, index) => <div key={index} className="zf-formation-row" aria-label={row.label}>
            {row.players.map(player => <Player key={player.id} player={player}/>)}
          </div>)}
        </div>
      </div>
      <p className="zf-formation-direction">↓ Sentido do ataque · {layout.source === "grid"
        ? "Posições fornecidas pela fonte" : layout.source === "formation"
        ? "Formação e funções divulgadas" : "Funções divulgadas · desenho tático não confirmado"}
        <span className="zf-formation-perspective">Esquerda da equipe à esquerda do campo.</span>
      </p>
      <div className="zf-formation-extras">
        <div className="zf-formation-coach">
          <span className="zf-formation-coach-photo"><Photo name={team.coach?.name || "Técnico"} src={team.coach?.photo || null} /></span>
          <div>
            <small>TÉCNICO</small>
            <strong>{team.coach?.name || "Não divulgado"}</strong>
          </div>
          <Shield size={18} aria-hidden="true" />
        </div>
        {team.substitutes.length > 0 && (
          <div className="zf-formation-bench">
            <h4>Banco de reservas <span>{team.substitutes.length}</span></h4>
            <div className="zf-formation-bench-list">
              {team.substitutes.map(player => (
                <span key={player.id} title={player.position}>
                  {player.number && <b>{player.number}</b>}
                  {player.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
