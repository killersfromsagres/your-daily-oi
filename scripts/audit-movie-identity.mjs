// Audit the complete text snapshot without downloading or replaying movie files.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {movieSourceFingerprint} from '../src/lib/movie-source-fingerprint.ts';
import {movieIdentityMap,movieTitleKey,indexMovieSources,findMovieSources,sourceMovieId} from '../src/lib/movie-source-identity.ts';
const folder=process.argv[2];
if(!folder)throw Error('Provide a directory containing fichas and all filmes-*.txt snapshots');
const metadata=readFileSync(join(folder,'fichas'),'utf8'),identities=movieIdentityMap(metadata);
const bases=[];
for(const line of readFileSync(join(folder,'indice'),'utf8').split('\n')){
 const match=/^base:\s*(\d+)\s+(.+)$/.exec(line);if(match)bases[Number(match[1])]=match[2].trim();
}
const expand=token=>{
 if(/^https?:\/\//.test(token))return token;
 const match=/^(\d+):(.+)$/.exec(token);if(!match||!bases[Number(match[1])])return '';
 return bases[Number(match[1])]+match[2]+(match[2].includes('.')?'':'.mp4');
};
const rows=[],rowsByFile=new Map(),homonyms=new Map();
for(const line of metadata.split('\n')){
 const [type,title,id]=line.split('\t');if(type!=='f'||!title)continue;
 const key=movieTitleKey(title.replace(/\s*\(\d{4}\)$/,'')),set=homonyms.get(key)||new Set();set.add(id);homonyms.set(key,set);
}
const files=readdirSync(folder).filter(name=>/^filmes-(?:[A-Z]|#)$/.test(name)).sort();
for(const file of files)for(const line of readFileSync(join(folder,file),'utf8').split('\n')){
 const [title,...fields]=line.split('\t');if(!title||!fields.length)continue;
 const streams=fields.flatMap(field=>{
  const match=/^(dub|leg)=(.*)$/.exec(field.trim());return match?match[2].split(',').map(token=>expand(token.trim())).filter(Boolean).map(url=>({url,audio:match[1]})):[];
 });rows.push({title,streams});const list=rowsByFile.get(file)||[];list.push({title,streams});rowsByFile.set(file,list);
}
if(process.argv.includes('--write-quarantine')){
 const owners=new Map();
 for(const row of rows){
  const ids=identities.get(movieTitleKey(row.title));if(ids?.size!==1)continue;
  const id=[...ids][0];
  for(const source of row.streams){
   const declared=sourceMovieId(source.url);if(declared!==null&&declared!==id)continue;
   const ids=owners.get(source.url)||new Set();ids.add(id);owners.set(source.url,ids);
  }
 }
 const fingerprints=[...owners].filter(([,ids])=>ids.size>1).map(([url])=>movieSourceFingerprint(url)).sort();
 writeFileSync('src/lib/movie-source-quarantine.json',JSON.stringify({auditedAt:'2026-11-14',reason:'Identical opaque source claimed by different TMDB movie IDs; no reliable owner.',fingerprints},null,2)+'\n');
}
const index=indexMovieSources(rows,identities);
const fileIndexes=[...rowsByFile.values()].map(group=>indexMovieSources(group,identities));
const remake=findMovieSources(index,{title:'Sexta-Feira 13',tmdbId:13207});
const original=findMovieSources(index,{title:'Sexta-Feira 13',tmdbId:4488});
const shared=remake.filter(s=>original.some(other=>other.url===s.url)).length;
console.log(JSON.stringify({files:files.length,movieMetadataRows:metadata.split('\n').filter(s=>s.startsWith('f\t')).length,uniqueMovieIds:new Set([...identities.values()].flatMap(s=>[...s])).size,titleCollisionGroups:[...homonyms.values()].filter(s=>s.size>1).length,sourceRows:rows.length,ambiguousMetadataRows:index.collisions,rejectedMismatchedRelays:index.mismatchedRelays,ambiguousSourceOccurrencesAcrossSnapshot:index.ambiguousSources,quarantinedWithinPlaybackBuckets:fileIndexes.reduce((sum,i)=>sum+i.ambiguousSources,0),friday2009:{sources:remake.length,explicitRelayIds:[...new Set(remake.map(s=>sourceMovieId(s.url)).filter(Boolean))]},friday1980:{sources:original.length,explicitRelayIds:[...new Set(original.map(s=>sourceMovieId(s.url)).filter(Boolean))]},sharedSources:shared},null,2));
if(files.length!==27||shared||remake.some(s=>sourceMovieId(s.url)===4488)||original.some(s=>sourceMovieId(s.url)===13207))process.exit(1);
