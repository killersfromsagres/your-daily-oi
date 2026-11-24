import {canonicalTvChannelIdentity,matchBrazilianBroadcastChannel,type TvChannelIdentity} from "./broadcast-match";
import {doesEpgDescribeFixture,type JogoBrasileirao} from "./jogos-match";
export type BroadcastOrigin="epg"|"espn"|"sportsdb"|"guia"|"configuracao"|"verificada";
export type BroadcastClaim={nome:string;origem:BroadcastOrigin};
export type ChannelRef={id:string;nome:string;logo?:string};
const weight:Record<BroadcastOrigin,number>={configuracao:60,verificada:50,epg:40,espn:30,sportsdb:20,guia:10};
const nonLive=/\b(reprise|replay|compacto|melhores momentos|highlights|retrospectiva|pos jogo|pre jogo|debate|documentario|classicos historicos)\b/;
const textKey=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export function isFixtureProgramme(p:{start:number;stop:number;title:string;desc?:string},g:Pick<JogoBrasileirao,"inicioIso"|"casa"|"fora">):boolean{
 const start=Date.parse(g.inicioIso),title=textKey(p.title||"");
 if(!Number.isFinite(start)||!Number.isFinite(p.start)||!Number.isFinite(p.stop)||p.stop<=p.start)return false;
 if(p.start<start-35*60_000||p.start>start+20*60_000||p.stop<start+55*60_000||nonLive.test(title))return false;
 // Both teams must be named in the programme title; generic news descriptions are not evidence.
 return doesEpgDescribeFixture(p.title,g.casa,g.fora);
}
export function normalizeClaims(claims:readonly BroadcastClaim[]):BroadcastClaim[]{
 const result:BroadcastClaim[]=[];const seen=new Set<string>();
 for(const claim of claims)for(const part of claim.nome.split(/[,;|]/)){const nome=part.trim();const key=canonicalTvChannelIdentity(nome);
 if(!key||nome.length>100||/^(a definir|a confirmar|nao informado|sem transmissao|tbd|none|unknown|n a)$/.test(textKey(nome)))continue;
 const token=claim.origem+"|"+key;if(seen.has(token))continue;seen.add(token);result.push({...claim,nome});}
 return result;
}
export function clearBroadcastLink(g:JogoBrasileirao){
 g.canalId=null;g.canalNome=null;g.canalLogo=null;g.transmissao="nao-confirmada";g.canaisDisponiveis=[];delete g.origemTransmissao;
}
export function resolveBroadcast(g:JogoBrasileirao,claims:readonly BroadcastClaim[],channels:readonly TvChannelIdentity[],epg:readonly ChannelRef[],checkedAt:string){
 clearBroadcastLink(g);
 const evidence=normalizeClaims(claims);g.evidenciasTransmissao=evidence;g.transmissaoVerificadaEm=checkedAt;
 const names=new Map<string,string>();for(const c of evidence)if(!names.has(canonicalTvChannelIdentity(c.nome)))names.set(canonicalTvChannelIdentity(c.nome),c.nome);
 g.canaisTransmissao=[...names.values()];
 if(g.status==="adiado"||g.transmissaoUrl)return;
 const candidates=new Map<string,{channel:ChannelRef;claim:BroadcastClaim;score:number}>();
 const add=(ch:ChannelRef,claim:BroadcastClaim)=>{
 if(!channels.some(c=>c.id===ch.id&&c.fontes.length))return;
 const previous=candidates.get(ch.id);const score=weight[claim.origem];if(!previous||score>previous.score)candidates.set(ch.id,{channel:ch,claim,score});};
 for(const claim of evidence){
   if(claim.origem==="epg"){if(!matchBrazilianBroadcastChannel(claim.nome,channels))continue;for(const ch of epg)if(canonicalTvChannelIdentity(ch.nome)===canonicalTvChannelIdentity(claim.nome))add(ch,claim);}
   else {const ch=matchBrazilianBroadcastChannel(claim.nome,channels);if(ch)add(ch,claim);}
 }
 const ranked=[...candidates.values()].sort((a,b)=>b.score-a.score||a.channel.id.localeCompare(b.channel.id));
 g.canaisDisponiveis=ranked.map(x=>x.channel);
 const first=ranked[0];if(!first)return;
 g.canalId=first.channel.id;g.canalNome=first.channel.nome;g.canalLogo=first.channel.logo||null;g.transmissao="confirmada";
 g.origemTransmissao=first.claim.origem==="epg"?"epg":first.claim.origem==="configuracao"?"configuracao":first.claim.origem==="verificada"?"verificada":"grade-br";
}
/** A linear channel cannot broadcast two different overlapping fixtures. Keep the names as announcements, but suppress ambiguous direct targets. */
export function removeOverlappingBroadcastLinks(games:readonly JogoBrasileirao[]){
 const claims=new Map<string,JogoBrasileirao[]>();
 for(const g of games){if(g.status==="adiado")continue;for(const c of g.canaisDisponiveis||[]){const key=canonicalTvChannelIdentity(c.nome);claims.set(key,[...(claims.get(key)||[]),g]);}}
 const conflicts=new Map<string,Set<string>>();
 for(const [key,rows] of claims)for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
 const a=rows[i]!,b=rows[j]!;const delta=Math.abs(Date.parse(a.inicioIso)-Date.parse(b.inicioIso));if(a.id===b.id||!Number.isFinite(delta)||delta>=105*60_000)continue;
 for(const g of [a,b]){const set=conflicts.get(g.id)||new Set<string>();set.add(key);conflicts.set(g.id,set);}
 }
 for(const g of games){const bad=conflicts.get(g.id);if(!bad)continue;
 const kept=(g.canaisDisponiveis||[]).filter(c=>!bad.has(canonicalTvChannelIdentity(c.nome)));
 if(g.canalNome&&bad.has(canonicalTvChannelIdentity(g.canalNome))){clearBroadcastLink(g);const next=kept[0];if(next){g.canalId=next.id;g.canalNome=next.nome;g.canalLogo=next.logo||null;g.transmissao="confirmada";g.origemTransmissao="grade-br";}}
 g.canaisDisponiveis=kept;
 }
}
