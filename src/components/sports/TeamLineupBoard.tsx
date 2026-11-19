"use client";
// ZANG FLIX — real-match roster portraits and conservative tactical positioning.
import { useEffect, useState } from "react";
import { Shield, UserRound, UsersRound } from "lucide-react";
import type { LineupPlayer, LineupTeam } from "@/lib/football-lineups";
import { buildTacticalLayout, positionBadge, POSITION_SECTORS } from "@/lib/lineup-tactics";

function Photo({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setFailed(false); setLoaded(false); }, [src]);
  const initials = name.split(" ").filter(Boolean).slice(-2)
    .map(part => part.charAt(0)).join("").toUpperCase() || "?";
  return (
    <span className="zf-formation-portrait" data-portrait={src && !failed ? "provider" : "fallback"}>
      <span className="zf-formation-photo-fallback" aria-hidden="true">
        {name==="Técnico"||name==="Não divulgado" ? <UserRound size={19}/> : initials}
      </span>
      {src && !failed && (
        <img src={src} alt={"Foto de " + name} loading="lazy" decoding="async"
          className={loaded ? "is-loaded" : ""}
          onLoad={event=>{
            if(event.currentTarget.naturalWidth>4 && event.currentTarget.naturalHeight>4) setLoaded(true);
            else setFailed(true);
          }}
          onError={() => setFailed(true)}/>
      )}
    </span>
  );
}
function Player({ player }: { player: LineupPlayer }) {
  const role = positionBadge(player);
  const description = [player.number ? "Camisa "+player.number : null,
    player.name,role.label].filter(Boolean).join(" · ");
  return (
    <div className="zf-formation-player" data-sector={role.group}
      data-position={role.code} data-player-id={player.id}
      aria-label={description} tabIndex={0} title={description}>
      <div className="zf-formation-player-avatar">
        <Photo name={player.name} src={player.photo}/>
        {player.number && <span className="zf-formation-shirt" aria-hidden="true">{player.number}</span>}
      </div>
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
      <div className="zf-formation-pitch" data-layout={layout.source}
        aria-label={"Campo tático: escalação de " + team.name}>
        <span className="zf-formation-top-box" aria-hidden="true" />
        <span className="zf-formation-center-line" aria-hidden="true" />
        <span className="zf-formation-center-circle" aria-hidden="true" />
        <span className="zf-formation-watermark" aria-hidden="true">ZANG <b>FLIX</b></span>
        <div className="zf-formation-players" style={{
          gridTemplateRows: `repeat(${layout.rows.length || 1}, minmax(100px, 1fr))`,
        }}>
          {layout.rows.map((row, index) => (
            <div key={index} className="zf-formation-row" aria-label={row.label}>
              {row.players.map(player => <Player key={player.id} player={player}/>)}
            </div>
          ))}
        </div>
      </div>
      <p className="zf-formation-direction">↓ Sentido do ataque · {layout.source === "grid"
        ? "Posições fornecidas pela fonte" : layout.source === "formation"
        ? "Formação e funções divulgadas" : "Funções divulgadas · desenho tático não confirmado"}
        <span className="zf-formation-perspective">
          {layout.source === "sectors"
            ? "Agrupamento ilustrativo; não representa coordenadas oficiais."
            : "Esquerda da equipe à esquerda do campo."}
        </span>
      </p>
      <div className="zf-formation-extras">
        <div className="zf-formation-coach">
          <span className="zf-formation-coach-photo">
            <Photo name={team.coach?.name || "Técnico"} src={team.coach?.photo || null}/>
          </span>
          <div className="zf-formation-coach-info">
            <small>COMISSÃO TÉCNICA</small>
            <strong>{team.coach?.name || "Técnico não divulgado"}</strong>
            <span>{team.coach?.photo
              ? "Retrato disponibilizado pelo provedor"
              : team.coach ? "Foto não disponibilizada pela fonte" : "Aguardando informação do provedor"}
            </span>
          </div>
          <Shield size={19} aria-hidden="true"/>
        </div>
        {team.substitutes.length > 0 && (
          <div className="zf-formation-bench">
            <h4><UsersRound size={16}/> Banco de reservas <span>{team.substitutes.length}</span></h4>
            <div className="zf-formation-bench-list">
              {team.substitutes.map(player => (
                <div key={player.id} className="zf-formation-bench-player"
                  aria-label={player.name+" · "+player.position} title={player.position}>
                  <span className="zf-formation-bench-photo">
                    <Photo name={player.name} src={player.photo}/>
                  </span>
                  <span className="zf-formation-bench-player-name">{player.name}</span>
                  {player.number && <b>{player.number}</b>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
