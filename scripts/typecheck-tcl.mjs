// Fail on TypeScript errors in the newly introduced TV experience only.
// The existing repository has unrelated type diagnostics.
import { spawnSync } from "node:child_process";
const result = spawnSync("bunx", ["tsc","--noEmit","--pretty","false"], { encoding:"utf8",maxBuffer:25*1024*1024 });
if (result.error) throw result.error;
const diagnosticLines = (result.stdout + "\n" + result.stderr).split(/\r?\n/)
  .filter(line => /error TS\d+:/.test(line));
const tvErrors = diagnosticLines.filter(line =>
  /^(src\/components\/icons\/TvAnimeFrameIcon\.tsx|src\/components\/player\/TvStreamPlayer\.tsx|src\/routes\/(tv-home|tv-live|tv-title|tv-app)\.tsx|src\/lib\/tv-(remote|focus|featured|featured-candidates|hero-art|hero-client|build|install|playback-plan|playback-optimizer)\.ts|src\/components\/search\/SearchSuggestionList\.tsx)\(/.test(line));
console.log(JSON.stringify({ event:"tv-typecheck",tvErrors:tvErrors.length,existingOtherDiagnostics:diagnosticLines.length-tvErrors.length }));
tvErrors.forEach(line=>console.error(line));
if (tvErrors.length) process.exit(1);
