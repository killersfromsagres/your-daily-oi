import type {CanalTV,FonteTV} from "./canais";
import {buildLiveProxyPath,classifyLiveSource,initialLiveMode,looksOffline,orderLiveSources,type LiveStreamFormat} from "./live-source";

/** Explicit finite plan for the TV shell. Never synthesize a URL or assume that
 * a playlist appearing in the catalog proves it is currently playable. */
export interface TvPlaybackAttempt {
  id:string;
  source:FonteTV;
  sourceIndex:number;
  url:string;
  mode:"direct"|"catalog"|"legacy";
  format:LiveStreamFormat;
}
export function tvPlaybackPlan(channel:CanalTV,maximum=9):TvPlaybackAttempt[]{
  const pool=orderLiveSources(channel.fontes.filter(source=>!looksOffline(source)));
  const output:TvPlaybackAttempt[]=[];
  const seen=new Set<string>();
  for(const source of pool){
    const originalIndex=channel.fontes.findIndex(f=>f.url===source.url);
    const kind=classifyLiveSource(source);
    const initial=initialLiveMode(source);
    // A sanctioned catalog source may be proxied by our own backend; never
    // manufacture credentials or bypass a provider's denial.
    const modes:TvPlaybackAttempt["mode"][]=initial==="direct"
      ?["direct","catalog","legacy"]:["catalog","direct","legacy"];
    for(const mode of modes){
      if(mode==="direct"&&!source.url.startsWith("https://"))continue;
      const url=mode==="direct"?source.url:buildLiveProxyPath(
        channel.id,originalIndex,source,mode==="catalog");
      if(seen.has(url))continue;
      seen.add(url);
      output.push({id:channel.id+":"+originalIndex+":"+mode,source,
        sourceIndex:originalIndex,url,mode,format:kind});
      if(output.length>=maximum)return output;
    }
  }
  return output;
}
export type TvConnectionReason =
  "timeout"|"network"|"decoder"|"no-progress"|"not-allowed"|"unavailable"|"unsupported";
export function tvFailureMessage(reason:TvConnectionReason,httpStatus?:number):string {
  if(httpStatus===401||httpStatus===403)return "Fonte bloqueada ou sem autorização (HTTP "+httpStatus+").";
  if(httpStatus===404||httpStatus===410)return "A fonte não está mais disponível (HTTP "+httpStatus+").";
  if(httpStatus===409)return "O catálogo e o servidor estão com versões diferentes (HTTP 409).";
  if(httpStatus===429)return "Servidor limitou as solicitações (HTTP 429).";
  if(httpStatus&&httpStatus>=500)return "Servidor de transmissão indisponível (HTTP "+httpStatus+").";
  switch(reason){
    case "timeout":return "Tempo limite de conexão excedido.";
    case "network":return "Falha na rede ou ao carregar os segmentos.";
    case "decoder":return "Formato de vídeo incompatível com a TV.";
    case "no-progress":return "A imagem congelou durante a transmissão.";
    case "not-allowed":return "Selecione Iniciar para liberar a reprodução nesta TV.";
    case "unsupported":return "A TV não suporta o formato desta fonte.";
    default:return "Esta fonte não conseguiu reproduzir.";
  }
}
export function tvSkipSameSource(status:number|null):boolean {
  return status===401||status===403||status===410||status===429;
}
