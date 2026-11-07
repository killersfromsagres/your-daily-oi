// scripts/typecheck-premium.mjs — Bun; strict new episode, icon and football diagnostics.
import { spawnSync } from "node:child_process";
const check=spawnSync("bunx",["tsc","--noEmit","--pretty","false"],{encoding:"utf8",maxBuffer:18*1024*1024});
if(check.error)throw check.error;
const lines=(check.stdout+"\n"+check.stderr).split(/\r?\n/);
const diagnostics=lines.filter(s=>/^src\/.*error TS\d+:/.test(s));
const scope=[
  /^src\/lib\/(?:episode-progress|football-ranking|jogos|jogos-match)\.ts\(/,
  /^src\/components\/(?:catalog\/EpisodeProgressControls|sports\/FootballIcon|layout\/Header|tv\/JogosShelf)\.tsx\(/,
  /^src\/routes\/(?:futebol|anime\.\$id|serie\.\$id|assistir\.anime\.\$id\.\$temp\.\$ep|assistir\.serie\.\$id\.\$temp\.\$ep)\.tsx\(/,
];
const newErrors=diagnostics.filter(s=>scope.some(re=>re.test(s)));
console.log(JSON.stringify({event:"premium-typecheck",scopeErrors:newErrors.length,otherExistingErrors:diagnostics.length-newErrors.length}));
for(const err of newErrors)console.error(err);
if(newErrors.length)process.exit(1);
