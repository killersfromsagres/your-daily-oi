import type { StreamSource } from "./types";

const LEG=/(?:^|[^a-z])(?:leg|legendado|legendada|subbed|subtitled|english|original audio)(?:$|[^a-z])/i;
const DUB=/(?:^|[^a-z])(?:dub|dublado|dublada|portugues|portuguese|pt[ _-]?br)(?:$|[^a-z])/i;
const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

/** Explicit foreign-language evidence beats an incorrect upstream DUB label. */
export function isDubbedVodSource(source:StreamSource):boolean {
  if(source.audio!=="dub")return false;
  try {
    const url=new URL(source.url,"https://zangflix.local");
    const version=url.searchParams.get("versao");
    if(version==="leg")return false;
    if(/(?:^|[\/._-])(?:leg|legendado|subbed)(?:[\/._-]|$)/i.test(normalize(decodeURIComponent(url.pathname))))return false;
  } catch { /* Metadata remains authoritative when URL parsing fails. */ }
  const name=normalize(source.name||"");
  if(LEG.test(name)&&!DUB.test(name))return false;
  return source.audioDeclared!==false;
}

export function dubbedVodSources<T extends StreamSource>(sources:readonly T[]):T[] {
  return sources.filter(isDubbedVodSource);
}

export function portugueseAudioTrack(tracks:readonly {lang?:string;language?:string;name?:string;label?:string}[]) {
  const index=tracks.findIndex(track=>/^(pt|por)(?:[-_]|$)/i.test(track.lang||track.language||"") ||
    DUB.test(normalize(track.name||track.label||"")));
  const foreign=tracks.some(track=>{
    const lang=track.lang||track.language||"";
    return !!lang&&!/^(pt|por|und)(?:[-_]|$)/i.test(lang);
  });
  return {index,foreign};
}
