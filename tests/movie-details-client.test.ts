import {afterEach,expect,test} from 'bun:test';
import {getMovieDetails,peekMovieDetails} from '../src/lib/movie-details-client';
import type {CatalogItem} from '../src/lib/types';
const original=globalThis.fetch;
afterEach(()=>{globalThis.fetch=original;});
test('returning from playback gets the exact movie card synchronously without another source request',async()=>{
 let requests=0;
 const movie:CatalogItem={id:'return-card-2009',catalogTitle:'Filme (2009)',title:'Filme',type:'f',tmdbId:13207,genres:[],streams:[]};
 globalThis.fetch=(async()=>{requests++;await new Promise(resolve=>setTimeout(resolve,20));return Response.json(movie);}) as typeof fetch;
 const a=getMovieDetails(movie.id),b=getMovieDetails(movie.id);
 expect(a).toBe(b);expect(requests).toBe(1);
 await a;
 expect(peekMovieDetails(movie.id)).toEqual(movie);
 expect(await getMovieDetails(movie.id)).toEqual(movie);
 expect(requests).toBe(1);
 expect(peekMovieDetails('return-card-1980')).toBeNull();
});
test('failed metadata requests are not cached and can recover on the next visit',async()=>{
 let attempts=0;
 globalThis.fetch=(async()=>++attempts===1?new Response('',{status:503}):Response.json({id:'retry-card',title:'Retry',type:'f',genres:[],streams:[]})) as typeof fetch;
 await expect(getMovieDetails('retry-card')).rejects.toThrow('503');
 expect(peekMovieDetails('retry-card')).toBeNull();
 expect((await getMovieDetails('retry-card')).id).toBe('retry-card');
 expect(attempts).toBe(2);
});
