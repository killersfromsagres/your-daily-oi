/**
 * Artwork recovery for lineups already identified by the fixture provider.
 * IDs must come from the published lineup, not from name-based searches.
 * Photos are optional and never synthesized or matched by similar names.
 */
export type SportsDbPhotoRecord = {
  idPlayer?: string | null;
  strPlayer?: string | null;
  strSport?: string | null;
  strCutout?: string | null;
  strThumb?: string | null;
  strRender?: string | null;
};
const photoCache=new Map<string,{url:string|null;expires:number}>();
const inFlight=new Map<string,Promise<string|null>>();
const CACHE_TTL=6*60*60_000;
export function providerPhoto(input:unknown):string|null {
  if(typeof input!=="string")return null;
  try {
    const url=new URL(input);
    if(url.protocol!=="https:"||url.username||url.password)return null;
    return url.href;
  }catch{return null;}
}
/** Keep every verified image of the SAME athlete. Some thumbnail CDNs
 * return 404 while their cutout or render still exists. The browser can
 * advance to the next real photograph without matching an unrelated face. */
export function portraitCandidatesFromSportsDbRecord(record:SportsDbPhotoRecord):string[] {
  return [...new Set([record.strThumb,record.strCutout,record.strRender]
    .map(providerPhoto).filter((url):url is string=>!!url))];
}
export function photoFromSportsDbRecord(record:SportsDbPhotoRecord):string|null {
  return portraitCandidatesFromSportsDbRecord(record)[0]||null;
}
export async function photoByPlayerId(id:string):Promise<string|null> {
  if(!/^\d{1,12}$/.test(id))return null;
  const known=photoCache.get(id);
  if(known&&known.expires>Date.now())return known.url;
  const running=inFlight.get(id);
  if(running)return running;
  const work=(async()=>{
    try{
      const response=await fetch(
        "https://www.thesportsdb.com/api/v1/json/123/lookupplayer.php?id="+id,{
          signal:AbortSignal.timeout(2400),
          headers:{Accept:"application/json"},
        });
      if(!response.ok)return null;
      const payload=await response.json() as {players?:SportsDbPhotoRecord[]|null};
      const record=payload.players?.find(p=>String(p.idPlayer||"")===id);
      if(!record || (record.strSport&&
          !/^(soccer|football)$/i.test(record.strSport)))return null;
      return photoFromSportsDbRecord(record);
    }catch{return null;}
  })().then(url=>{
    if(photoCache.size>900)photoCache.delete(photoCache.keys().next().value!);
    photoCache.set(id,{url,expires:Date.now()+CACHE_TTL});
    return url;
  }).finally(()=>{inFlight.delete(id);});
  inFlight.set(id,work);
  return work;
}
export interface MissingLineupPhoto {
  id:string;
  hasPhoto:boolean;
}
/** Small bounded enrichment: at most 12 missing photos per fixture,
 * four requests at a time. Does not change names, roster, or positions. */
export async function enrichKnownLineupPhotos(
  candidates:readonly MissingLineupPhoto[],limit=12,
):Promise<Map<string,string>> {
  const selected=[...new Set(candidates
    .filter(p=>!p.hasPhoto && /^\d{1,12}$/.test(p.id)).map(p=>p.id))].slice(0,limit);
  const photos=new Map<string,string>();
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,selected.length)},async()=>{
    while(cursor<selected.length){
      const id=selected[cursor++]!;
      const photo=await photoByPlayerId(id);
      if(photo)photos.set(id,photo);
    }
  }));
  return photos;
}
