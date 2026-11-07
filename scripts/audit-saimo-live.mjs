// scripts/audit-saimo-live.mjs — Bun/Node; live catalog schema audit, no full media downloads.
import { parseCanais, filterCanaisAndExtractCategories } from "../src/lib/canais.ts";

const CATALOG = "https://canais-saimo.pages.dev/catalogo.txt";
const DISABLED = "https://saimo-tv.pages.dev/fontes-desativadas.json";
const timeout = (s = 10000) => AbortSignal.timeout(s);

async function text(url) {
  const r = await fetch(url, { signal: timeout(), headers: { Accept: "text/plain,*/*" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).hostname}`);
  return r.text();
}
function formatStats(raw) {
  const freq = new Map();
  for (const ch of raw) {
    const key = ch.categoria || "Sem categoria";
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  const extensions = {};
  const hosts = new Map();
  let drm = 0, http = 0, headers = 0, sources = 0;
  for (const ch of raw) for (const src of ch.fontes) {
    sources++;
    const u = new URL(src.url);
    hosts.set(u.hostname, (hosts.get(u.hostname) || 0) + 1);
    const path = u.pathname.toLowerCase();
    const ext = path.endsWith(".m3u8") ? "HLS" : path.endsWith(".mpd") ? "DASH" : path.endsWith(".ts") ? "TS" : path.endsWith(".mp4") ? "MP4" : "UNKNOWN";
    extensions[ext] = (extensions[ext] || 0) + 1;
    if (src.chave) drm++;
    if (src.referer || src.agente) headers++;
    if (u.protocol === "http:") http++;
  }
  return { channels: raw.length, sources, categories: Object.fromEntries([...freq].sort((a,b)=>b[1]-a[1])), formats: extensions, drm, http, headers, hosts: [...hosts].sort((a,b)=>b[1]-a[1]).slice(0,15) };
}
const catalogText = await text(CATALOG);
const lines = catalogText.split(/\r?\n/);
console.log(JSON.stringify({event:"catalog", bytes:catalogText.length, lines:lines.length, first20Kinds:lines.slice(0,20).map(s=>s.trim().replace(/https?:\/\/\S+/g,"<url>").slice(0,100))}));
const parsed = parseCanais(catalogText);
let disabled = [];
try {
  const res = await fetch(DISABLED, { signal: timeout(6500) });
  if (res.ok) disabled = (await res.json()).desativados || [];
} catch {}
const filtered = filterCanaisAndExtractCategories(parsed, disabled);
console.log(JSON.stringify({event:"parsed", raw:formatStats(parsed), filtered:formatStats(filtered.canais), disabledCount:disabled.length, sampleChannels:filtered.canais.slice(0,8).map(c=>({name:c.nome, sources:c.fontes.length,category:c.categoria}))}));
console.log(JSON.stringify({event:"source-structures", entries:parsed.slice(0,6).map(c=>({name:c.nome, sources:c.fontes.slice(0,2).map(s=>({format:new URL(s.url).pathname.match(/\.(m3u8|mpd|ts|mp4)$/i)?.[1]||"other",quality:s.qualidade,hasRef:!!s.referer,hasUa:!!s.agente,hasKey:!!s.chave}))}))}));

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
  Accept: "*/*",
};
const declared = lines.filter(line => line.trim().toLowerCase().startsWith("canal:")).length;
const sourceDecl = lines.filter(line => line.trim().toLowerCase().startsWith("fonte:")).length;
const errorSources = parsed.flatMap(ch => ch.fontes).filter(f => {
  try { return new URL(f.url).pathname.toLowerCase().endsWith("/error.txt"); } catch { return false; }
}).length;
const unknownSamples = parsed.flatMap(c => c.fontes.map(f => ({ channel: c.nome, source: f }))).filter(({source}) => {
  try { return !/\\.(m3u8|mpd|ts|mp4)$/i.test(new URL(source.url).pathname); } catch { return false; }
}).slice(0,12);
console.log(JSON.stringify({
  event:"coverage", declared, sourceDecl, errorSources, parsedChannels:parsed.length,
  declaredVsParsed:declared-parsed.length,
  unknownPatterns:unknownSamples.map(({channel,source})=>({
    channel, path:new URL(source.url).pathname.replace(/\\d{4,}/g,"<id>").slice(0,100),
    queryParams:[...new URL(source.url).searchParams.keys()].slice(0,8),
    quality:source.qualidade,
  })),
}));

for(const name of ["Band","CNN Brasil","A&E","Globo SP","SBT","Canal Gov"]) {
  const channel=filtered.canais.find(c=>c.nome.toLowerCase()===name.toLowerCase());
  if(!channel) continue;
  const probes=[];
  for(const source of channel.fontes.slice(0,2)){
    const u=new URL(source.url);
    try {
      const r=await fetch(source.url, {
        redirect:"follow",signal:timeout(5500),
        headers:{...headers,...(source.referer?{Referer:source.referer}:{}),Range:"bytes=0-1"},
      });
      const type=r.headers.get("content-type")||"";
      const locationHost=new URL(r.url).hostname;
      await r.body?.cancel();
      probes.push({status:r.status,contentType:type,finalHost:locationHost,initialHost:u.hostname,quality:source.qualidade||null});
    }catch(error){probes.push({error:error instanceof Error?error.name:"network",initialHost:u.hostname});}
  }
  console.log(JSON.stringify({event:"sample-probe",name,sources:channel.fontes.length,probes}));
}
