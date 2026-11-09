// scripts/typecheck-vod.mjs — Bun; strict diagnostics for changed VOD modules.
import { spawnSync } from "node:child_process";
const run = spawnSync("bunx", ["tsc","--noEmit","--pretty","false"], {
  encoding:"utf8", maxBuffer:20*1024*1024,
});
if (run.error) throw run.error;
const lines = (run.stdout+"\n"+run.stderr).split(/\r?\n/);
const diagnostics = lines.filter(line => /^src\/.*error TS\d+:/.test(line));
const scoped = diagnostics.filter(line => {
  if (/^src\/lib\/saimo-vod-url\.ts\(/.test(line)) return true;
  if (/^src\/routes\/assistir\.(?:filme|serie|anime)\.\$id/.test(line)) return true;
  const match = line.match(/^src\/(lib\/[^(/]+\.ts|components\/player\/[^(/]+\.tsx|server\.ts)\((\d+),/);
  if (!match) return false;
  const file = match[1], lineNumber = Number(match[2]);
  if (file === "lib/saimo-stream.ts") return lineNumber >= 395 && lineNumber <= 520;
  if (file === "lib/catalog.ts") return lineNumber >= 1 && lineNumber <= 38;
  if (file === "lib/sushianimes.ts") return lineNumber >= 309 && lineNumber <= 368;
  if (file === "components/player/OwnPlayer.tsx") return lineNumber >= 199 && lineNumber <= 233;
  if (file === "components/player/usePlayerEngine.tsx") return lineNumber >= 160 && lineNumber <= 205;
  if (file === "server.ts") return lineNumber >= 437 && lineNumber <= 555;
  return false;
});
console.log(JSON.stringify({
  event:"vod-typecheck",changedModuleErrors:scoped.length,
  otherProjectErrors:diagnostics.length-scoped.length,
}));
for (const error of scoped) console.error(error);
if (scoped.length) process.exit(1);
