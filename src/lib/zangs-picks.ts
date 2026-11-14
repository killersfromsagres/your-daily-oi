import type { CatalogItem } from "./types";

/**
 * Curadoria fixa da seção "Mais terror na sua noite".
 * As edições (especialmente os remakes) são identificadas pelo TMDB ID.
 * Nunca inventamos links de filme ou substituímos uma versão por outra.
 */
export const ZANGS_PICKS = [
  // Maratona Jason: o original, o clássico Capítulo Final e o remake de 2009.
  {tmdbId:4488, title:"Sexta-Feira 13 (1980)", year:1980, aliases:["Sexta-Feira 13","Friday the 13th"]},
  {tmdbId:9730, title:"Sexta-Feira 13: O Capítulo Final", year:1984, aliases:["Sexta-Feira 13: O Capítulo Final","Sexta-Feira 13 Parte 4 O Capítulo Final","Friday the 13th: The Final Chapter"]},
  {tmdbId:13207,title:"Sexta-Feira 13 (2009)", year:2009, aliases:["Sexta-Feira 13","Friday the 13th"]},
  // Freddy Krueger, Michael Myers e os clássicos sobrenaturais pedidos.
  {tmdbId:377, title:"A Hora do Pesadelo", year:1984, aliases:["A Hora do Pesadelo","A Nightmare on Elm Street"]},
  {tmdbId:948, title:"Halloween: A Noite do Terror", year:1978, aliases:["Halloween","Halloween: A Noite do Terror"]},
  {tmdbId:694, title:"O Iluminado", year:1980, aliases:["O Iluminado","The Shining"]},
  {tmdbId:3021,title:"1408", year:2007, aliases:["1408"]},
  {tmdbId:561, title:"Constantine", year:2005, aliases:["Constantine"]},

  // Preserve os demais filmes da seleção anterior (menos Hereditário).
  {tmdbId:138843,title:"Invocação do Mal"},
  {tmdbId:9902,title:"Pânico na Floresta"},
  {tmdbId:1690,title:"O Albergue"},
  {tmdbId:1691,title:"O Albergue 2"},
  {tmdbId:71670,title:"O Albergue 3"},
  {tmdbId:530385,title:"Midsommar: O Mal Não Espera a Noite"},
] as const;

function normalizeFilmTitle(title:string):string {
  let value=title;
  try {value=decodeURIComponent(value);} catch { /* títulos não codificados */ }
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\s*\(\d{4}\)\s*$/,"").toLowerCase()
    .replace(/[^a-z0-9]+/g," ").trim();
}

function catalogEditionYear(item:CatalogItem):number | null {
  if (item.tmdb?.releaseYear) return item.tmdb.releaseYear;
  const title=item.catalogTitle || item.title;
  const match=title.match(/\((\d{4})\)\s*$/);
  return match ? Number(match[1]) : null;
}

export function selectZangsPicks(items:CatalogItem[]):CatalogItem[] {
  const movies=items.filter(item=>item.type==="f" && !item.alias);
  const byTmdb=new Map<number,CatalogItem>();
  for(const item of movies) {
    if(item.tmdbId && !byTmdb.has(item.tmdbId)) byTmdb.set(item.tmdbId,item);
  }
  const used=new Set<string>();
  return ZANGS_PICKS.flatMap(pick=>{
    let item=byTmdb.get(pick.tmdbId);
    // Compatibilidade com fichas antigas sem ID: só aceita título exato
    // *e* o ano confirmado. Nunca troca o filme de 1980 pelo de 2009.
    if(!item && "aliases" in pick && "year" in pick) {
      const keys=new Set((pick.aliases as readonly string[]).map(normalizeFilmTitle));
      item=movies.find(movie=>!movie.tmdbId && catalogEditionYear(movie)===pick.year &&
        keys.has(normalizeFilmTitle(movie.catalogTitle || movie.title)));
    }
    if(!item || used.has(item.id)) return [];
    used.add(item.id);
    return [{...item,title:pick.title,
      tmdb:item.tmdb ? {...item.tmdb,title:pick.title} : item.tmdb}];
  });
}
