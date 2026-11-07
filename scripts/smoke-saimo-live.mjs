// scripts/smoke-saimo-live.mjs — Bun; actual Cloudflare Worker + live Saimo channels.
import { spawn } from "node:child_process";
const child = spawn("bunx", ["wrangler@4", "--cwd", ".output", "dev", "--local", "--ip", "127.0.0.1", "--port", "4174"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let errlog = "";
child.stderr.on("data", (chunk) => { errlog = (errlog + String(chunk)).slice(-2500); });
const BASE = "http://127.0.0.1:4174";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timeout = (s = 12000) => AbortSignal.timeout(s);
try {
  let ready = false;
  for (let i = 0; i < 42; i++) {
    if (child.exitCode !== null) throw new Error("Worker encerrou: " + errlog);
    try {
      const r = await fetch(`${BASE}/api/version`, { signal: timeout(3000) });
      if (r.status === 200) { ready = true; break; }
    } catch {}
    await sleep(400);
  }
  if (!ready) throw new Error("Worker não iniciou: " + errlog);

  const listResponse = await fetch(`${BASE}/api/canais`, { signal: timeout(20000) });
  const list = await listResponse.json();
  const channels = list.canais || [];
  const sources = channels.reduce((sum, ch) => sum + ch.fontes.length, 0);
  console.log(JSON.stringify({ event: "worker-catalog", status: listResponse.status, channels: channels.length, sources, categories: (list.categorias || []).length }));
  if (listResponse.status !== 200 || channels.length < 150 || sources < 200) {
    throw new Error("Lista de canais não chegou ao Worker em quantidade suficiente");
  }

  const band = channels.find((ch) => ch.nome === "Band");
  if (!band || band.fontes.length < 1) throw new Error("Band não está presente no catálogo real");
  const bandIndex = band.fontes.findIndex((src) => src.url.includes(".m3u8"));
  if (bandIndex === -1) throw new Error("Não há fonte HLS da Band no catálogo atual");
  const probe = await fetch(`${BASE}/api/live-format?canal=${band.id}&fonte=${bandIndex}`, { signal: timeout(9000) });
  const format = await probe.json();
  console.log(JSON.stringify({ event: "worker-live-format", status: probe.status, format: format.format }));
  if (probe.status !== 200 || format.format !== "hls") throw new Error("Rota de formato ao vivo não responde HLS");


  async function probeMediaFragment(manifest) {
    let currentManifest = manifest;
    for (let depth = 0; depth < 3; depth++) {
      const line = currentManifest.split(/\r?\n/).map((s) => s.trim()).find((s) => s && !s.startsWith("#"));
      if (!line) return false;
      const child = new URL(line, BASE);
      if (child.origin !== BASE || child.pathname !== "/api/live-proxy") return false;
      const upstream = child.searchParams.get("url") || "";
      const manifestChild = /\.(m3u8?|txt)(\?|$)/i.test(upstream);
      const response = await fetch(child.href, {
        headers: manifestChild ? {} : { Range: "bytes=0-511" },
        signal: timeout(14000),
      });
      if (!response.ok) {
        console.log(JSON.stringify({ event: "worker-live-child", status: response.status, depth }));
        await response.body?.cancel();
        return false;
      }
      const mime = response.headers.get("content-type") || "";
      if (manifestChild || mime.includes("mpegurl")) {
        currentManifest = await response.text();
        if (!currentManifest.trimStart().startsWith("#EXTM3U")) return false;
        continue;
      }
      const reader = response.body?.getReader();
      const first = reader ? await reader.read() : { done: true };
      const received = first.value?.byteLength || 0;
      await reader?.cancel();
      console.log(JSON.stringify({ event: "worker-live-fragment", status: response.status, mime, bytesReceived: received }));
      return received > 0;
    }
    return false;
  }

  const invalid = await fetch(BASE + "/api/tv/stream?canal=not-a-channel&fonte=0", { signal: timeout(7000) });
  if (invalid.status !== 404) throw new Error("Endpoint catalog-bound aceitou fonte inexistente");
  await invalid.body?.cancel();

  const candidates = [
    ...channels.filter((ch) => /^(band|sbt)$/i.test(ch.nome)).flatMap((ch) =>
      ch.fontes.map((src, index) => ({ ch, src, index }))
        .filter(({ src }) => src.url.includes(".m3u8")).slice(0, 2),
    ),
  ].slice(0, 4);
  let success = false;
  for (const { ch, src, index } of candidates) {
    const query = new URLSearchParams({ canal: ch.id, fonte: String(index) });
    try {
      const res = await fetch(`${BASE}/api/tv/stream?${query}`, { signal: timeout(14000) });
      const body = (await res.text()).slice(0, 250000);
      const manifest = res.ok && body.trimStart().startsWith("#EXTM3U");
      console.log(JSON.stringify({ event: "worker-live-manifest", via: "/api/tv/stream", channel: ch.nome, status: res.status, type: res.headers.get("content-type"), manifest, proxiedSegments: body.includes("/api/live-proxy?url="), bytesRead: body.length }));
      if (manifest && body.includes("/api/live-proxy?url=") && await probeMediaFragment(body)) { success = true; break; }
    } catch (error) {
      console.log(JSON.stringify({ event: "worker-live-manifest", channel: ch.nome, networkError: error instanceof Error ? error.name : "unknown" }));
    }
  }
  if (!success) throw new Error("Nenhum canal amostrado entregou playlist e fragmento real via Worker");
} finally {
  child.kill("SIGTERM");
}
