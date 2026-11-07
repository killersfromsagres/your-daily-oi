// scripts/typecheck-tv-glass.mjs — strict diagnostics for TV glass and programme files.
import { spawnSync } from "node:child_process";
const result=spawnSync("bunx",["tsc","--noEmit","--pretty","false"],{
  encoding:"utf8",maxBuffer:16*1024*1024
});
const lines=(result.stdout+"\n"+result.stderr).split(/\r?\n/);
const diagnostics=lines.filter(line=>/^src\/.*error TS\d+:/.test(line));
const focused=diagnostics.filter(line=>
 /^src\/components\/tv\/(?:TvView|ChannelCard)\.tsx\(/.test(line) ||
 /^src\/lib\/tv-program\.ts\(/.test(line) ||
 (()=>{const m=line.match(/^src\/routes\/__root\.tsx\((\d+),/);return !!m&&Number(m[1])<85;})() ||
 (()=>{const m=line.match(/^src\/lib\/epg\.ts\((\d+),/);return !!m&&Number(m[1])>=310&&Number(m[1])<445;})()
);
console.log(JSON.stringify({event:"tv-glass-typecheck",newErrors:focused.length,
  inheritedProjectErrors:diagnostics.length-focused.length}));
for(const line of focused)console.error(line);
if(result.error)throw result.error;
if(focused.length)process.exit(1);
