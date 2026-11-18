#!/usr/bin/env node
// Back up ONLY public catalog metadata. Never archive DRM keys, media URLs,
// signed query strings, referers, cookies or stream token data in a public repo.
// The site remains dependent on an authorized, functioning media provider.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backup = resolve(root, "src/data/zang-backup");
const ownOrigins = (process.env.ZANG_BACKUP_OWN_ORIGINS ||
  "https://zangflix.lovable.app,https://zangflix.vercel.app")
  .split(",").map(x => x.trim().replace(/\/+$/, ""))
  .filter(x => /^https:\/\/[a-z0-9.-]+$/i.test(x));
const vodRoots = [
  "https://filmes-saimo.pages.dev",
  "https://raw.githubusercontent.com/gabrielsaimo/SaimoPlayer/main/vod",
];
const tvRoots = [
  "https://canais-saimo.pages.dev/catalogo.txt",
  "https://canais-saimo.pages.dev/canais.txt",
];

const read = name => JSON.parse(readFileSync(resolve(backup, name), "utf8"));
function writeIfChanged(name, previous, next, key) {
  const stable = data => JSON.stringify(data[key]);
  if (stable(previous) === stable(next)) {
    console.log(JSON.stringify({event:"archive-unchanged",file:name}));
    return;
  }
  next.updatedAt = new Date().toISOString();
  writeFileSync(resolve(backup,name), JSON.stringify(next,null,2)+"\n", "utf8");
  console.log(JSON.stringify({event:"archive-updated",file:name,count:
    Array.isArray(next[key]) ? next[key].length : next[key].split("\n").filter(Boolean).length}));
}
async function fetchSafe(url, type = "json") {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:") throw Error("HTTPS required");
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(12000),
    redirect: "follow",
    headers: { Accept:type === "json" ? "application/json" : "text/plain, */*" },
  });
  if (!response.ok) throw Error("HTTP " + response.status);
  if (Number(response.headers.get("content-length") || 0) > 18_000_000)
    throw Error("oversized response");
  const body = await response.text();
  if (body.length > 18_000_000) throw Error("oversized response");
  return type === "json" ? JSON.parse(body) : body;
}
function reportFailure(label, error) {
  // No URLs, cookies, bearer headers or query parameters in CI logs.
  console.warn(JSON.stringify({event:"archive-source-unavailable",source:label,
    error:error instanceof Error ? error.name : "unknown"}));
}
function field(v, limit=250) {
  return typeof v === "string" ? v.replace(/[\t\r\n]+/g," ").trim().slice(0,limit) : "";
}
function poster(raw) {
  const value = field(raw,512);
  if (/^\/[a-zA-Z0-9_./-]+\.(?:jpg|jpeg|png|webp)$/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.origin === "https://image.tmdb.org" && !url.search)
      return url.pathname.replace(/^\/t\/p\/[^/]+/, "");
  } catch {}
  return "";
}
function fichaRow(parts) {
  if (!Array.isArray(parts) || parts.length < 4) return null;
  const [kind,title,tmdbId,art,genres] = parts;
  const k = field(kind,1), name = field(title,280);
  if (!["f","s","a"].includes(k) || !name) return null;
  const number = String(tmdbId || "").trim();
  const id = /^[1-9]\d{0,11}$/.test(number) ? number : "";
  const safeGenres = Array.isArray(genres) ? genres.map(v=>field(v,80)).filter(Boolean)
    : String(genres || "").split(",").map(v=>field(v,80)).filter(Boolean);
  return [k,name,id,poster(art),safeGenres.slice(0,16).join(",")].join("\t");
}
const fichaKey = line => {
  const columns = line.split("\t");
  return (columns[0] || "")+"|"+(columns[1] || "").toLocaleLowerCase("pt-BR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim()+"|"+(columns[2] || "");
};
function fichasFromApi(items) {
  if (!Array.isArray(items)) return [];
  return items.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const line = fichaRow([
      item.type, item.catalogTitle || item.title, item.tmdbId,
      item.posterPath || item.posterUrl, item.genres,
    ]);
    return line ? [line] : [];
  });
}
function parseRawFichas(text) {
  if (typeof text !== "string" || /<html|<!doctype/i.test(text.slice(0,200))) return [];
  return text.split(/\r?\n/).flatMap(line => {
    const columns=line.split("\t");
    const parsed=fichaRow(columns);
    return parsed ? [parsed] : [];
  });
}
function mergeRows(previous, incoming) {
  const merged = new Map();
  // Prefer fresh provider metadata but never delete a previously saved title.
  for (const row of [...incoming,...previous]) {
    if (!merged.has(fichaKey(row))) merged.set(fichaKey(row),row);
  }
  return [...merged.values()].sort((a,b)=>fichaKey(a).localeCompare(fichaKey(b),"pt-BR"));
}
function displayLines(highlights) {
  if (!Array.isArray(highlights)) return "";
  const result = [];
  for (const row of highlights.slice(0,80)) {
    if (!row || typeof row.rowName !== "string" || !Array.isArray(row.items)) continue;
    const lines = row.items.slice(0,50).flatMap(item => {
      const kind=field(item?.type,1);
      if (!["f","s"].includes(kind) || !field(item?.title)) return [];
      return [ [kind,field(item.title),field(item.letter,10),field(item.year,6),
        poster(item.posterPath)].join("\t") ];
    });
    if (lines.length) result.push("fila\t"+field(row.rowName,100),...lines);
  }
  return result.length ? result.join("\n")+"\n" : "";
}
function validLogo(raw) {
  try {
    const url=new URL(raw);
    if (url.protocol!=="https:" || url.username || url.password || url.search)
      return undefined;
    return url.toString().slice(0,512);
  } catch {return undefined;}
}
function cleanChannel(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id=field(raw.id,120), nome=field(raw.nome,180);
  if (!/^[a-z0-9-]{1,120}$/.test(id)||!nome) return null;
  const logo=validLogo(raw.logo);
  return {id,nome,categoria:field(raw.categoria,100)||"Variedades",
    ...(logo?{logo}:{})}; // DELIBERATELY OMIT fontes/keys/headers.
}
function slug(name) {
  return field(name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/&/g,"-e-").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}
function channelsFromText(body) {
  if (typeof body !== "string" || !body.trim()) return [];
  const rows=[];
  let name="",category="Variedades",logo="";
  for (const original of body.split(/\r?\n/)) {
    const line=original.trim();
    if (line.startsWith("canal:")) {
      if (name) rows.push({id:slug(name),nome:name,categoria:category,logo});
      name=field(line.slice(6));category="Variedades";logo="";
    } else if (name && line.startsWith("categoria:")) {
      category=field(line.slice(10),100);
    } else if (name && line.startsWith("logo:")) {
      logo=line.slice(5).trim();
    } else if (line.startsWith("#EXTINF:")) {
      if (name) rows.push({id:slug(name),nome:name,categoria:category,logo});
      name=field(line.split(",").slice(1).join(","));
      const cat=line.match(/group-title="([^"]*)"/i);
      const img=line.match(/tvg-logo="([^"]*)"/i);
      category=cat?field(cat[1],100):"Variedades";
      logo=img?img[1]:"";
    }
  }
  if (name)rows.push({id:slug(name),nome:name,categoria:category,logo});
  return rows.map(cleanChannel).filter(Boolean);
}
function mergeChannels(existing,newItems) {
  const map=new Map();
  for(const item of [...existing,...newItems]){
    const valid=cleanChannel(item);
    if (!valid)continue;
    map.set(valid.id,{...(map.get(valid.id)||{}),...valid});
  }
  return [...map.values()].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
}
function cleanAnime(raw) {
  if (!raw || typeof raw !== "object") return null;
  const slugId=field(raw.slug||raw.id,160);
  const title=field(raw.title,220);
  if(!/^[a-z0-9-]{2,160}$/i.test(slugId) || !title) return null;
  return {
    slug:slugId,title,
    posterUrl:validLogo(raw.posterUrl)||"",
    genres:Array.isArray(raw.genres) ? raw.genres.map(x=>field(x,90)).filter(Boolean).slice(0,12) : [],
    audio:raw.audio==="dub"?"dub":"leg",
    ...(typeof raw.quality==="string"?{quality:field(raw.quality,30)}:{}),
    ...(Number.isInteger(raw.year)&&raw.year>=1900&&raw.year<2100?{year:raw.year}:{}),
  };
}
function mergeAnime(oldItems,newItems){
  const map=new Map();
  for(const item of [...oldItems,...newItems]){
    const safe=cleanAnime(item);
    if(safe) map.set(safe.slug,{...(map.get(safe.slug)||{}),...safe});
  }
  return [...map.values()].sort((a,b)=>a.title.localeCompare(b.title,"pt-BR"));
}

const savedCatalog=read("catalog.json");
const collectedFichas=[];
let selectedHighlights="";
let ownCatalogSuccess=false;
for(const origin of ownOrigins){
  try {
    const data=await fetchSafe(origin+"/api/catalogo");
    const lines=fichasFromApi(data.items);
    if(lines.length < 10) throw Error("insufficient catalog metadata");
    collectedFichas.push(...lines);
    ownCatalogSuccess=true;
    if(!selectedHighlights) selectedHighlights=displayLines(data.highlights);
    console.log(JSON.stringify({event:"owned-catalog-recovered",origin:new URL(origin).host,items:lines.length}));
  } catch(err){reportFailure("owned-catalog",err);}
}
if(!ownCatalogSuccess){
  for(const root of vodRoots){
    try {
      const raw=await fetchSafe(root+"/fichas.txt","text");
      const lines=parseRawFichas(raw);
      if(lines.length<10)throw Error("insufficient catalog metadata");
      collectedFichas.push(...lines);
      if(!selectedHighlights){
        try { const text=await fetchSafe(root+"/destaques.txt","text");
          if (/^fila\t/m.test(text)) selectedHighlights=text.slice(0,1_000_000);
        }catch{}
      }
      console.log(JSON.stringify({event:"public-ficha-recovered",host:new URL(root).host,items:lines.length}));
      break;
    }catch(err){reportFailure("catalog-provider",err);}
  }
}
const oldRows=parseRawFichas(savedCatalog.fichas);
const mergedFichas=mergeRows(oldRows,collectedFichas).slice(0,100_000);
writeIfChanged("catalog.json",savedCatalog,{
  version:1,source:collectedFichas.length?"snapshot-recovery":"local-archive",
  fichas:mergedFichas.join("\n")+(mergedFichas.length?"\n":""),
  destaques:selectedHighlights || savedCatalog.destaques || "",
  updatedAt:savedCatalog.updatedAt,
},"fichas");
// Commit highlights updates even if movie rows did not change.
const actual=read("catalog.json");
if(selectedHighlights && selectedHighlights!==actual.destaques){
  actual.destaques=selectedHighlights;
  actual.updatedAt=new Date().toISOString();
  writeFileSync(resolve(backup,"catalog.json"),JSON.stringify(actual,null,2)+"\n");
}

const savedTv=read("tv.json");
const collectedChannels=[];
for(const origin of ownOrigins){
  try{
    const data=await fetchSafe(origin+"/api/canais");
    const records=Array.isArray(data.canais)?data.canais:[];
    if(records.length<10)throw Error("insufficient channel metadata");
    collectedChannels.push(...records.map(cleanChannel).filter(Boolean));
    console.log(JSON.stringify({event:"owned-tv-recovered",origin:new URL(origin).host,channels:records.length}));
  }catch(err){reportFailure("owned-tv",err);}
}
if(!collectedChannels.length){
  for(const endpoint of tvRoots){
    try{
      const data=await fetchSafe(endpoint,"text");
      const parsed=channelsFromText(data);
      if(parsed.length<10) throw Error("insufficient channel metadata");
      collectedChannels.push(...parsed);
      console.log(JSON.stringify({event:"public-tv-recovered",host:new URL(endpoint).host,channels:parsed.length}));
    }catch(err){reportFailure("tv-provider",err);}
  }
}
writeIfChanged("tv.json",savedTv,{
  version:1,source:collectedChannels.length?"catalog-metadata":"local-archive",
  channels:mergeChannels(savedTv.channels||[],collectedChannels),
  updatedAt:savedTv.updatedAt,
},"channels");

const savedAnime=read("sushi.json");
let recoveredAnime=[];
for(const origin of ownOrigins){
  try{
    const first=await fetchSafe(origin+"/api/animes-sushi?pagina=1");
    if(!Array.isArray(first.items)||!first.items.length) throw Error("empty anime catalog");
    const pageCount=Math.min(Math.max(1,Number(first.totalPaginas)||1),18);
    const pages=[first.items];
    for(let nextPage=2;nextPage<=pageCount;nextPage+=4){
      const batch=await Promise.allSettled(Array.from({length:Math.min(4,pageCount-nextPage+1)},
        (_,offset)=>fetchSafe(origin+"/api/animes-sushi?pagina="+(nextPage+offset))));
      for(const row of batch){
        if(row.status==="fulfilled"&&Array.isArray(row.value.items))pages.push(row.value.items);
      }
    }
    recoveredAnime=pages.flat().map(cleanAnime).filter(Boolean);
    if(recoveredAnime.length){
      console.log(JSON.stringify({event:"owned-anime-recovered",host:new URL(origin).host,items:recoveredAnime.length}));
      break;
    }
  }catch(err){reportFailure("owned-anime",err);}
}
writeIfChanged("sushi.json",savedAnime,{
  version:1,source:recoveredAnime.length?"catalog-metadata":"local-archive",
  items:mergeAnime(savedAnime.items||[],recoveredAnime),
  updatedAt:savedAnime.updatedAt,
},"items");
console.log(JSON.stringify({event:"zang-backup-complete",
  movieSeriesAnime:mergedFichas.length,
  channels:read("tv.json").channels.length,
  sushiAnime:read("sushi.json").items.length,
  mediaUrlsArchived:0}));
