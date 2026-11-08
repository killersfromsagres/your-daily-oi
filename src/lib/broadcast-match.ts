// Verified broadcast identity: never guess channel from league rights.
export interface TvChannelIdentity { id:string; nome:string; logo?:string; fontes:{url:string}[] }
export function normalizeTvChannelIdentity(value:string):string {
  return (value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\+/g," plus ").replace(/\bsport\s*tv\b/g,"sportv")
    .replace(/\bcaze\s*tv\b/g,"cazetv")
    .replace(/\bpremier\s+clubes\b/g,"premiere clubes")
    .replace(/\b(ultra hd|full hd|fhd|uhd|hd|sd|4k|1080p|720p)\b/g,"")
    .replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
const aliases:Record<string,string> = {
  "espn brasil":"espn","pfc":"premiere","tv globo":"globo","prime video":"amazon prime video",
};
const canonical=(name:string):string=>{
  const key=normalizeTvChannelIdentity(name);
  return aliases[key]||key;
};
export function matchBrazilianBroadcastChannel(name:string, channels:readonly TvChannelIdentity[]):{id:string;nome:string;logo?:string}|null {
  const normalized=canonical(name);
  if(!normalized)return null;
  const choices=channels.filter(ch=>ch.fontes?.length>0 && canonical(ch.nome)===normalized);
  if(!choices.length)return null;
  const selected=choices.find(ch=>ch.nome.toLowerCase()===name.toLowerCase())||choices[0]!;
  return {id:selected.id,nome:selected.nome,...(selected.logo?{logo:selected.logo}:{})};
}
