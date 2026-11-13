// Verified broadcast identity: never guess channel from league rights.
export interface TvChannelIdentity { id:string; nome:string; logo?:string; fontes:{url:string}[] }
export function normalizeTvChannelIdentity(value:string):string {
  return (value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\+/g," plus ").replace(/\bsport\s*tv\b/g,"sportv")
    .replace(/\bcaze\s*tv\b/g,"cazetv")
    .replace(/\bge\s*tv\b|\bgetv\b/g,"getv")
    .replace(/^rede\s+globo\b|^tv\s+globo\b/g,"globo")
    .replace(/\bpremier\s+clubes\b/g,"premiere clubes")
    .replace(/\b(ultra hd|full hd|fhd|uhd|hd|sd|4k|1080p|720p)\b/g,"")
    .replace(/\b(ao vivo|online|24h|24 horas|oficial)\b/g,"")
    .replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
const aliases:Record<string,string> = {
  "espn brasil":"espn","pfc":"premiere","tv globo":"globo","rede globo":"globo",
  "globo tv":"globo","tv ge":"getv","ge tv":"getv","prime video":"amazon prime video",
};
export const canonicalTvChannelIdentity=(name:string):string=>{
  const key=normalizeTvChannelIdentity(name);
  return aliases[key]||key;
};
export function matchBrazilianBroadcastChannel(name:string, channels:readonly TvChannelIdentity[]):{id:string;nome:string;logo?:string}|null {
  const normalized=canonicalTvChannelIdentity(name);
  if(!normalized)return null;
  const available=channels.filter(ch=>ch.fontes?.length>0);
  let choices=available.filter(ch=>canonicalTvChannelIdentity(ch.nome)===normalized);
  // A network-level "SporTV" listing means the main channel, never SporTV 2/3.
  // Similarly Globo can have region-labelled feeds; prefer a São Paulo affiliate
  // only if the exact national channel is absent (and never guess unrelated TV).
  if(!choices.length && normalized==="sportv")
    choices=available.filter(ch=>canonicalTvChannelIdentity(ch.nome)==="sportv 1");
  if(!choices.length && normalized==="globo") {
    const regional=available.filter(ch=>/^globo (sp|sao paulo|rj|rio de janeiro)$/.test(
      canonicalTvChannelIdentity(ch.nome)));
    choices=regional.filter(ch=>/^(globo sp|globo sao paulo)$/.test(canonicalTvChannelIdentity(ch.nome)));
    if(!choices.length && regional.length===1)choices=regional;
  }
  if(!choices.length)return null;
  const selected=choices.find(ch=>ch.nome.toLowerCase()===name.toLowerCase())||choices[0]!;
  return {id:selected.id,nome:selected.nome,...(selected.logo?{logo:selected.logo}:{})};
}
