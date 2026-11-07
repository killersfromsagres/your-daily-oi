// scripts/scan-visible-branding.mjs — Bun: review Saimo mentions in UI source and metadata.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const root="src";
const paths=[];
function traverse(dir){
 for(const entry of readdirSync(dir)){
  const p=join(dir,entry);
  if(statSync(p).isDirectory())traverse(p);
  else if(/\.(ts|tsx|html|css)$/.test(p))paths.push(p);
 }
}
traverse(root);
const matches=[];
for(const path of paths){
 const lines=readFileSync(path,"utf8").split(/\r?\n/);
 lines.forEach((line,i)=>{
  if(/\bsaimo(?:\s+tv)?\b/i.test(line)){
   matches.push({path,line:i+1,text:line.trim().slice(0,240)});
  }
 });
}
console.log(JSON.stringify({event:"branding-audit",filesScanned:paths.length,mentions:matches.length,items:matches.slice(0,160)}));
