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
  if (response.status === 200) {
    const probe = JSON.parse(body);
    if (!["mp4","hls","ts"].includes(probe.format)) {
      throw new Error("Formato desconhecido na origem de vídeo");
    }
    if (probe.format === "hls") {
      const playlist = await fetch(target.replace("&probe=1", ""), {
        signal: AbortSignal.timeout(12000),
      });
      const text = await playlist.text();
      if (!playlist.ok || !text.trimStart().startsWith("#EXTM3U")) {
        throw new Error("HLS sem manifesto válido no proxy");
      }
      console.log(JSON.stringify({test:"HLS do VOD",status:playlist.status,manifest:true}));
    } else if (probe.format === "mp4") {
      // Only the first two bytes are transferred when the CDN honors Range.
      const media = await fetch(target.replace("&probe=1", ""), {
        headers: { Range: "bytes=0-1" },
        signal: AbortSignal.timeout(12000),
      });
      if (media.status === 206) {
        const bytes = await media.arrayBuffer();
        const range = media.headers.get("content-range") || "";
        if (bytes.byteLength !== 2 || !range.startsWith("bytes 0-1/")) {
          throw new Error("Resposta MP4 Range inconsistente");
        }
        console.log(JSON.stringify({test:"MP4 Range",status:206,bytes:bytes.byteLength}));
      } else {
        await media.body?.cancel();
        if (!media.ok) throw new Error("CDN falhou ao responder MP4: HTTP "+media.status);
        console.log(JSON.stringify({test:"MP4 sem suporte a Range",status:media.status}));
      }
    }
  }
} finally {
  child.kill("SIGTERM");
}
