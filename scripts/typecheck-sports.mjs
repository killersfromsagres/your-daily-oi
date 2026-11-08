// scripts/typecheck-sports.mjs — Bun; type-check sports modules without hiding inherited errors.
import { spawnSync } from "node:child_process";
const run = spawnSync("bunx",["tsc","--noEmit","--pretty","false"],{
 encoding:"utf8",maxBuffer:16*1024*1024
});
const lines=(run.stdout+"\n"+run.stderr).split(/\r?\n/);
const diagnostics=lines.filter(line=>/^src\/.*error TS\d+:/.test(line));
const relevant=diagnostics.filter(line=>
 /^src\/lib\/(?:jogos|jogos-match|broadcast-match|standings)\.ts\(/.test(line) ||
 (() => { const epgLine=line.match(/^src\/lib\/epg\.ts\((\d+),/); return !!epgLine && Number(epgLine[1]) >= 449; })() ||
 /^src\/components\/(?:tv\/JogosShelf|sports\/LeagueStandings)\.tsx\(/.test(line) ||
 /^src\/server\.ts\(21(0[0-9]|1[0-9]|2[0-9]|3[0-9]),/.test(line)
);
console.log(JSON.stringify({event:"sports-typecheck",newModuleErrors:relevant.length,
 legacyProjectErrors:diagnostics.length-relevant.length,
 checked:["jogos.ts","jogos-match.ts","epg.ts new matcher (legacy EPG errors excluded)","JogosShelf.tsx","server sports route"]}));
for(const err of relevant)console.error(err);
if(run.error)throw run.error;
if(relevant.length)process.exit(1);
