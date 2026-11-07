// scripts/smoke-vod-preview.mjs — Bun/Node; testa a rota do player no build real.
import { spawn } from "node:child_process";

const child = spawn("bunx", ["wrangler@4", "--cwd", ".output", "dev", "--local", "--ip", "127.0.0.1", "--port", "4173"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-3000); });
const target = "http://127.0.0.1:4173/api/saimo-vod?tipo=movie&id=550&versao=dub&probe=1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let response = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (child.exitCode !== null) throw new Error("Preview encerrou antes de abrir porta: " + stderr);
    try {
      response = await fetch(target, { signal: AbortSignal.timeout(10000) });
      break;
    } catch {
      await sleep(350);
    }
  }
  if (!response) throw new Error("Preview indisponível: " + stderr);
  const body = await response.text();
  console.log(JSON.stringify({ test: "GET /api/saimo-vod?probe=1", status: response.status, body: body.slice(0, 350) }));
  if (response.status !== 200 && response.status !== 404 && response.status !== 502) {
    throw new Error(`Rota respondeu HTTP ${response.status}; esperado 200 ou falha upstream legível`);
  }
  if (response.status === 200 && JSON.parse(body).format !== "mp4") {
    throw new Error("Formato inesperado do stream de teste (esperado MP4)");
  }
  if (response.status === 200) {
    // Somente 2 bytes reais: valida o corpo 206 do vídeo, sem baixar a mídia.
    const media = await fetch(target.replace("&probe=1", ""), {
      headers: { Range: "bytes=0-1" },
      signal: AbortSignal.timeout(12000),
    });
    const bytes = await media.arrayBuffer();
    console.log(JSON.stringify({
      test: "GET /api/saimo-vod Range 0-1",
      status: media.status,
      contentType: media.headers.get("content-type"),
      contentRange: media.headers.get("content-range")?.replace(/\/.+$/, "/<total>"),
      bytes: bytes.byteLength,
    }));
    if (media.status !== 206 || bytes.byteLength !== 2 || !media.headers.get("content-range")?.startsWith("bytes 0-1/")) {
      throw new Error("Resposta MP4 Range incompleta: seek não funcionará");
    }
  }
} finally {
  child.kill("SIGTERM");
}
