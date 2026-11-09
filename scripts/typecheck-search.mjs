// scripts/typecheck-search.mjs — Bun; report search-specific TypeScript diagnostics.
import { spawnSync } from "node:child_process";
const check = spawnSync("bunx", ["tsc", "--noEmit", "--pretty", "false"], {
  encoding: "utf8", maxBuffer: 20*1024*1024,
});
if (check.error) throw check.error;
const lines = (check.stdout + "\n" + check.stderr).split(/\r?\n/);
const all = lines.filter(line => /^src\/.*error TS\d+:/.test(line));
const related = all.filter(line =>
  /^src\/lib\/search-suggestions\.ts\(/.test(line) ||
  /^src\/components\/search\/(?:SearchSuggestionList\.tsx|useLiveSuggestions\.ts)\(/.test(line) ||
  /^src\/components\/layout\/(?:Header|MobileNavigation)\.tsx\(/.test(line) ||
  /^src\/routes\/(?:busca|__root)\.tsx\(/.test(line) ||
  /^src\/server\.ts\((?:17[0-9]|18[0-9]|19[0-9]),/.test(line)
);
console.log(JSON.stringify({event:"search-typecheck",newErrors:related.length,otherProjectErrors:all.length-related.length}));
for (const issue of related) console.error(issue);
if (related.length || (check.status !== 0 && !all.length)) {
  if (!related.length) console.error(check.stderr || check.stdout);
  process.exit(1);
}
