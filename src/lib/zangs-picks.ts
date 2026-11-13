import type { CatalogItem } from "./types";

/** Exact catalog editions: never substitute a sequel, remake or title match. */
export const ZANGS_PICKS = [
  {tmdbId:138843,title:"Invocação do Mal"},
  {tmdbId:9902,title:"Pânico na Floresta"},
  {tmdbId:1690,title:"O Albergue"},
  {tmdbId:1691,title:"O Albergue 2"},
  {tmdbId:71670,title:"O Albergue 3"},
  {tmdbId:493922,title:"Hereditário"},
  {tmdbId:530385,title:"Midsommar: O Mal Não Espera a Noite"},
] as const;

export function selectZangsPicks(items:CatalogItem[]):CatalogItem[] {
  const byTmdb = new Map<number,CatalogItem>();
  for (const item of items) {
    if (item.type === "f" && item.tmdbId && !byTmdb.has(item.tmdbId)) byTmdb.set(item.tmdbId,item);
  }
  return ZANGS_PICKS.flatMap(pick => {
    const item = byTmdb.get(pick.tmdbId);
    return item ? [{...item,title:pick.title,
      tmdb:item.tmdb ? {...item.tmdb,title:pick.title} : item.tmdb}] : [];
  });
}
