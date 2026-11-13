"use client";
// src/components/sports/TeamLineupBoard.tsx — one-team portrait football lineup.
import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import type { LineupPlayer, LineupTeam, PlayerPosition } from "@/lib/football-lineups";

const SECTIONS: { group: PlayerPosition; label: string }[] = [
  { group: "GOL", label: "Goleiro" },
  { group: "DEF", label: "Defesa" },
  { group: "MEI", label: "Meio-campo" },
  { group: "ATA", label: "Ataque" },
];

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
  return (
    <div className="zf-formation-player" title={player.position}>
      <Photo name={player.name} src={player.photo}/>
      <strong>{player.number && <span>{player.number} </span>}{player.name}</strong>
      <small>{player.position}</small>
    </div>
  );
}
function FormationRow({ group, label, team }: { group: PlayerPosition; label: string; team: LineupTeam }) {
  const players = team.starting.filter(player => player.group === group);
  return (
    <div className={"zf-formation-row zf-formation-row--" + group} aria-label={label}>
      {players.map(player => <Player key={player.id} player={player} />)}
    </div>
  );
}
export function TeamLineupBoard({ team }: { team: LineupTeam }) {
  return (
    <div className="zf-formation-content">
      <div className="zf-formation-pitch" aria-label={"Campo tático: escalação de " + team.name}>
        <span className="zf-formation-top-box" aria-hidden="true" />
        <span className="zf-formation-center-line" aria-hidden="true" />
        <span className="zf-formation-center-circle" aria-hidden="true" />
        <span className="zf-formation-bottom-box" aria-hidden="true" />
        <span className="zf-formation-watermark" aria-hidden="true">ZANG <b>FLIX</b></span>
        <div className="zf-formation-players">
          {SECTIONS.map(section => <FormationRow key={section.group} {...section} team={team}/>)}
        </div>
      </div>
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
