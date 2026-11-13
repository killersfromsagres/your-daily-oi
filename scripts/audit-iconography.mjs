// Scan every application TSX module, including routes and player components.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>
  entry.isDirectory()?walk(join(dir,entry.name)):[join(dir,entry.name)]);
const files=walk("src").filter(file=>file.endsWith(".tsx"));
const rejected=new Set(["Sparkles","Stars","Orbit","Wand","WandSparkles","BrainCircuit","Bot"]);
const problems=[];let iconModules=0,svgModules=0;
for(const file of files){
  const source=readFileSync(file,"utf8");
  if(source.includes('from "lucide-react"')||source.includes("/icons/ContentIcons"))iconModules++;
  if(/<svg\b/.test(source))svgModules++;
  for(const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/gs)){
    for(const specifier of match[1].split(",")){
      const name=specifier.trim().split(/\s/)[0];
      if(rejected.has(name))problems.push({file,problem:"decorative metaphor",icon:name});
      if(name==="Tv")problems.push({file,problem:"legacy antenna television pictogram",icon:name});
    }
  }
  if(/[★☆✨🤖]/u.test(source))problems.push({file,problem:"text/emoji pictogram"});
}
console.log(JSON.stringify({event:"iconography-audit",tsxModulesScanned:files.length,
  modulesUsingVectorIcons:iconModules,remainingRawSvgModules:svgModules,problems},null,2));
if(problems.length)process.exitCode=1;
