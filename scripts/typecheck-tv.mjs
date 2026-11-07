// scripts/typecheck-tv.mjs — Check strict diagnostics in the TV overhaul and report legacy baseline separately.
import { spawnSync } from "node:child_process";

const result = spawnSync("bunx", ["tsc", "--noEmit", "--pretty", "false"], {
  encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
});
const lines = (result.stdout + "\n" + result.stderr).split(/\r?\n/);
const errors = lines.filter(line => /^src\/.*error TS\d+:/.test(line));
const tvPaths = [
  /^src\/components\/tv\/TvView\.tsx\(/,
  /^src\/components\/player\/LivePlayer\.tsx\(/,
  /^src\/lib\/live-source\.ts\(/,
  /^src\/lib\/live-probe\.ts\(/,
];
const relevant = errors.filter(line => tvPaths.some(pattern => pattern.test(line)) ||
  /^src\/server\.ts\(12(7[6-9]|8[0-9]|9[0-5]),/.test(line));
console.log(JSON.stringify({
  event:"tv-typecheck",tvErrors:relevant.length,
  inheritedProjectErrors:errors.length-relevant.length,
  checked:"TV view, player, source parser, live-format probe and new server handler",
}));
if(relevant.length){for(const error of relevant)console.error(error);process.exit(1);}
if(result.error)throw result.error;
