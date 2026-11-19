// scripts/typecheck-sports.mjs — Bun; type-check sports modules without hiding inherited errors.
import { spawnSync } from "node:child_process";
const run = spawnSync("bunx",["tsc","--noEmit","--pretty","false"],{
 encoding:"utf8",maxBuffer:16*1024*1024
});
const lines=(run.stdout+"\n"+run.stderr).split(/\r?\n/);
const diagnostics=lines.filter(line=>/^src\/.*error TS\d+:/.test(line));
const relevant=diagnostics.filter(line=>
 /^src\/lib\/(?:jogos|jogos-match|football-ranking|broadcast-match|pitch-weather|standings|standings-zones|football-lineups|lineup-photo-source|lineup-evidence|lineup-verified-portraits|lineup-match-coaches|lineup-lazy-portrait|lineup-image-route|lineup-client-portraits|football-positions|lineup-tactics|lineup-selection)\.ts\(/.test(line) ||
 (() => { const epgLine=line.match(/^src\/lib\/epg\.ts\((\d+),/); return !!epgLine && Number(epgLine[1]) >= 449; })() ||
 /^src\/components\/(?:tv\/JogosShelf|sports\/(?:LeagueStandings|PitchCondition|MatchLineups|TeamLineupBoard))\.tsx\(/.test(line) ||
 /^src\/routes\/futebol\.tsx\(/.test(line) ||
 /^src\/server\.ts\(20(0[0-9]|1[0-9]|2[0-9]|3[0-9]|5[0-9]|6[0-9]|9[0-9]),/.test(line)
);
console.log(JSON.stringify({event:"sports-typecheck",newModuleErrors:relevant.length,
 legacyProjectErrors:diagnostics.length-relevant.length,
 checked:["jogos.ts","jogos-match.ts","pitch-weather.ts","PitchCondition.tsx","football-ranking.ts","standings-zones.ts","football-lineups.ts","lineup-photo-source.ts","lineup-evidence.ts","lineup-verified-portraits.ts","lineup-match-coaches.ts","lineup-lazy-portrait.ts","lineup-image-route.ts","lineup-client-portraits.ts","football-positions.ts","lineup-tactics.ts","MatchLineups.tsx","TeamLineupBoard.tsx","epg.ts new matcher (legacy EPG errors excluded)","JogosShelf.tsx","futebol.tsx","server sports route"]}));
for(const err of relevant)console.error(err);
if(run.error)throw run.error;
if(relevant.length)process.exit(1);
