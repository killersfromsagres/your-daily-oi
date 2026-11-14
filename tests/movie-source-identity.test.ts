import {describe,expect,test} from 'bun:test';
import {movieIdentityMap,movieTitleKey,indexMovieSources,findMovieSources,findCatalogItem,selectMovieSearchResult} from '../src/lib/movie-source-identity';
import {parseFichas} from '../src/lib/catalog';
import type {CatalogItem} from '../src/lib/types';
const metadata=[
 'f\tSexta-Feira 13\t13207\t/remake.jpg\tTerror',
 'f\tSexta-Feira 13 (1980)\t4488\t/original.jpg\tTerror',
 'f\tSexta-Feira 13 (2009)\t13207\t/remake.jpg\tTerror',
 'f\tA Coisa (1982)\t1091\t/1982.jpg\tTerror',
 'f\tA Coisa (2011)\t60935\t/2011.jpg\tTerror',
].join('\n');
const relay=(id:number)=>({url:`https://saimo-tv.pages.dev/api/stream?tipo=movie&id=${id}&versao=dub`,audio:'dub' as const});
describe('Movie identity isolation across all catalogue buckets',()=>{
 test('preserves year-qualified source keys and route IDs while keeping display titles clean',()=>{
  expect(movieTitleKey('Sexta-Feira 13 (1980)')).not.toBe(movieTitleKey('Sexta-Feira 13 (2009)'));
  const records=parseFichas(metadata),items=new Map([...records].map(([key,item])=>[key,{...item,streams:[]} as CatalogItem]));
  for(const [route,id] of [['sextafeira 13',13207],['sextafeira 13 1980',4488],['sextafeira 13 2009',13207]] as const){
   const item=findCatalogItem(items,route,'f');expect(item?.tmdbId).toBe(id);expect(item?.title).toBe('Sexta-Feira 13');
  }
  expect(findCatalogItem(items,'13207','f')?.tmdbId).toBe(13207);
  expect(findCatalogItem(items,'sextafeira 13 1980','s')).toBeUndefined();
 });
 test('merges only aliases with the same TMDB identity, never original and remake',()=>{
  const index=indexMovieSources([
   {title:'Sexta-Feira 13',streams:[relay(13207),{url:'https://cdn.example/remake.mp4',audio:'dub'}]},
   {title:'Sexta-Feira 13 (2009)',streams:[relay(13207),{url:'https://cdn.example/remake-1080.mp4',audio:'dub'}]},
   {title:'Sexta-Feira 13 (1980)',streams:[relay(4488),{url:'https://cdn.example/original.mp4',audio:'dub'}]},
  ],movieIdentityMap(metadata));
  const remake=findMovieSources(index,{title:'Sexta-Feira 13',tmdbId:13207}),original=findMovieSources(index,{title:'Sexta-Feira 13',tmdbId:4488});
  expect(remake).toHaveLength(3);expect(original).toHaveLength(2);
  expect(remake.some(s=>original.some(other=>s.url===other.url))).toBe(false);
 });
 test('quarantines contradictory relay IDs and opaque files claimed by different movies',()=>{
  const shared={url:'https://cdn.example/wrong-shared.mp4',audio:'dub' as const};
  const index=indexMovieSources([
   {title:'Sexta-Feira 13 (2009)',streams:[relay(4488),shared,relay(13207)]},
   {title:'Sexta-Feira 13 (1980)',streams:[shared,relay(4488)]},
  ],movieIdentityMap(metadata));
  expect(index.mismatchedRelays).toBe(1);expect(index.ambiguousSources).toBe(2);
  expect(findMovieSources(index,{title:'x',tmdbId:13207})).toEqual([relay(13207)]);
  expect(findMovieSources(index,{title:'x',tmdbId:4488})).toEqual([relay(4488)]);
 });
 test('repairs the legacy sixth-part alias that was mislabeled as the 2009 remake',()=>{
  const identities=movieIdentityMap(metadata+'\nf\tSexta.Feira.13 -6\t13207');
  const index=indexMovieSources([{title:'Sexta.Feira.13 -6',streams:[relay(13207),{url:'https://cdn.example/part6.mp4',audio:'dub'}]}],identities);
  expect(findMovieSources(index,{title:'Sexta-Feira 13',tmdbId:13207})).toEqual([]);
  expect(findMovieSources(index,{title:'Sexta-Feira 13 - Parte 6',tmdbId:10225})).toHaveLength(1);
  expect(index.mismatchedRelays).toBe(1);
 });
 test('does not borrow sources by a yearless title when the known movie is missing',()=>{
  const index=indexMovieSources([{title:'A Coisa (1982)',streams:[relay(1091)]}],movieIdentityMap(metadata));
  expect(findMovieSources(index,{title:'A Coisa',tmdbId:60935})).toEqual([]);
 });
 test('rejects ambiguous metadata and search results instead of taking the first popular remake',()=>{
  const identities=movieIdentityMap('f\tDuplicado\t1\nx\tx\t2\nf\tDuplicado\t2');
  expect(indexMovieSources([{title:'Duplicado',streams:[relay(1)]}],identities).byTitle.size).toBe(0);
  const results=[{id:13207,title:'Sexta-Feira 13',release_date:'2009-02-13'},{id:4488,title:'Sexta-Feira 13',release_date:'1980-05-09'}];
  expect(selectMovieSearchResult(results,'Sexta-Feira 13')).toBeNull();
  expect(selectMovieSearchResult(results,'Sexta-Feira 13 (1980)')).toBe(4488);
  expect(selectMovieSearchResult(results,'Sexta-Feira 13 (2009)')).toBe(13207);
  expect(selectMovieSearchResult(results,'Outro filme')).toBeNull();
 });
});
