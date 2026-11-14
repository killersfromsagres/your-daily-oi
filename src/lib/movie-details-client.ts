import type { CatalogItem } from "./types";

const TTL = 5 * 60_000, LIMIT = 24;
const entries = new Map<string,{item:CatalogItem;expires:number}>();
const pending = new Map<string,Promise<CatalogItem>>();
export function peekMovieDetails(id:string): CatalogItem | null {
  const entry=entries.get(id);
  if (!entry || entry.expires<=Date.now()) return null;
  return entry.item;
}
export function rememberMovieDetails(id:string,item:CatalogItem): void {
  const entry={item,expires:Date.now()+TTL};
  entries.delete(id);entries.set(id,entry);
  entries.set(item.id,entry);
  while(entries.size>LIMIT)entries.delete(entries.keys().next().value!);
}
/** Movie cards and the watch route share one small metadata cache, not a source gate. */
export function getMovieDetails(id:string): Promise<CatalogItem> {
  const cached=peekMovieDetails(id);
  if(cached)return Promise.resolve(cached);
  const existing=pending.get(id);
  if(existing)return existing;
  const request=fetch(`/api/item?id=${encodeURIComponent(id)}&tipo=movie`,{cache:"no-store"})
    .then(async response=>{
      if(!response.ok)throw Error(`Ficha HTTP ${response.status}`);
      const item=await response.json() as CatalogItem;
      if(!item?.id||item.type!=="f")throw Error("Ficha de filme inválida");
      rememberMovieDetails(id,item);return item;
    }).finally(()=>pending.delete(id));
  pending.set(id,request);return request;
}
