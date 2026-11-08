"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, Trophy, AlertCircle } from "lucide-react";
import { TABLE_LEAGUES, type StandingsResponse, type StandingsRow } from "@/lib/standings";
import "@/styles/league-standings.css";

function Crest({row}:{row:StandingsRow}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[row.logo]);
  return row.logo&&!failed?
    <img src={row.logo} alt="" loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:
    <span className="ztable-team-fallback" aria-hidden="true">{row.abbreviation.slice(0,2)}</span>;
}
export function LeagueStandings({compact=true}:{compact?:boolean}) {
  const [open,setOpen]=useState(!compact);
  const [league,setLeague]=useState("bra.1");
  const [payload,setPayload]=useState<StandingsResponse|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [nonce,setNonce]=useState(0);
  useEffect(()=>{
    if(!open)return;
    let active=true;
    const controller=new AbortController();
    setLoading(true);setError(null);setPayload(null);
    fetch("/api/futebol/tabela?liga="+encodeURIComponent(league),{
      cache:"no-store",headers:{Accept:"application/json"},signal:controller.signal,
    }).then(async response=>{
      const json=await response.json() as StandingsResponse&{erro?:string};
      if(!response.ok)throw new Error(json.erro||"Não foi possível obter a tabela");
      return json;
    }).then(result=>{if(active)setPayload(result);})
      .catch(reason=>{if(active&&!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Tabela indisponível");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;controller.abort();};
  },[open,league,nonce]);
  useEffect(()=>{
    if(!open)return;
    const refresh=()=>{if(document.visibilityState==="visible")setNonce(n=>n+1);};
    const timer=window.setInterval(refresh,10*60_000);
    document.addEventListener("visibilitychange",refresh);
    return ()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};
  },[open]);
  const show=(value:number|null)=>value===null?"—":String(value);
  return <section className={"ztable-panel"+(open?" is-open":"")} aria-label="Tabelas de classificação dos campeonatos">
    <div className="ztable-heading">
      <div className="ztable-heading-icon"><Trophy size={21}/></div>
      <div className="ztable-heading-copy"><small>CENTRAL DE CLASSIFICAÇÃO</small><h3>Tabelas dos <em>campeonatos.</em></h3>
        <p>Posições e estatísticas fornecidas pela fonte esportiva, com atualização automática.</p></div>
      <button type="button" className="ztable-toggle" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>
        {open?"Ocultar tabelas":"Ver classificações"} {open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
      </button>
    </div>
    {open&&<div className="ztable-content">
      <div className="ztable-league-tabs" role="group" aria-label="Selecione o campeonato">
        {TABLE_LEAGUES.map(item=><button type="button" key={item.id} aria-pressed={item.id===league}
          className={"ztable-league-tab"+(item.id===league?" is-active":"")} onClick={()=>setLeague(item.id)}>
          {item.name}</button>)}
      </div>
      <div className="ztable-meta"><span>{payload?.temporada?"TEMPORADA "+payload.temporada:"CLASSIFICAÇÃO"}</span>
        <button type="button" disabled={loading} onClick={()=>setNonce(n=>n+1)} aria-label="Atualizar tabela">
          <RefreshCw size={14} className={loading?"ztable-spinning":""}/> Atualizar
        </button>
      </div>
      {loading?<div className="ztable-state" role="status">Carregando classificação…</div>:
        error?<div className="ztable-state" role="alert"><AlertCircle size={18}/>{error}
          <button type="button" onClick={()=>setNonce(n=>n+1)}>Tentar novamente</button></div>:
        payload?.grupos.length?<div className="ztable-groups">
          {payload.parcial&&<p className="ztable-warning">{payload.erro}</p>}
          {payload.grupos.map(group=><div className="ztable-group" key={group.id}>
            <div className="ztable-group-title"><strong>{group.name}</strong><span>{group.rows.length} equipes</span></div>
            <div className="ztable-scroll" tabIndex={0} role="region" aria-label={"Classificação: "+group.name}>
              <table><thead><tr><th scope="col">POS.</th><th scope="col" className="ztable-club">TIME</th>
                <th scope="col">PTS</th><th scope="col">J</th><th scope="col">V</th>
                <th scope="col">E</th><th scope="col">D</th><th scope="col">SG</th></tr></thead>
                <tbody>{group.rows.map(row=><tr key={row.id} className={row.position===1?" is-leader":""}>
                  <td><span className="ztable-position">{row.position}</span></td>
                  <td className="ztable-club"><span className="ztable-club-name"><Crest row={row}/><strong title={row.name}>{row.name}</strong></span></td>
                  <td className="ztable-points">{show(row.points)}</td><td>{show(row.played)}</td>
                  <td>{show(row.won)}</td><td>{show(row.drawn)}</td><td>{show(row.lost)}</td>
                  <td>{show(row.goalDifference)}</td>
                </tr>)}</tbody></table>
            </div>
          </div>)}
          <p className="ztable-notice">J: jogos · V: vitórias · E: empates · D: derrotas · SG: saldo de gols. Sem faixas de classificação presumidas.</p>
        </div>:<div className="ztable-state">Esta competição ainda não tem classificação publicada.</div>}
    </div>}
  </section>;
}
