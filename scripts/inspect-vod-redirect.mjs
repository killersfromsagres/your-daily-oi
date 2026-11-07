// scripts/inspect-vod-redirect.mjs — Bun/Node 20+, HTTP status/headers only, never downloads a film.
const entry = new URL("https://saimo-tv.pages.dev/api/stream");
entry.searchParams.set("tipo", "movie");
entry.searchParams.set("id", "550");
entry.searchParams.set("versao", "dub");
const visited = new Set();
let current = entry;
for (let hop = 0; hop < 6; hop++) {
  if (visited.has(current.href)) { console.log("redirect loop"); break; }
  visited.add(current.href);
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";
  try {
    const res = await fetch(current, {
      method: "GET", redirect: "manual", signal: AbortSignal.timeout(6500),
      headers: { "User-Agent": ua, Accept: "*/*", Range: "bytes=0-1", Referer: "https://saimo-tv.pages.dev/" },
    });
    const loc = res.headers.get("location");
    console.log(JSON.stringify({ hop, host: current.host, path: current.pathname, status: res.status, contentType: res.headers.get("content-type"), length: res.headers.get("content-length"), range: res.headers.get("content-range"), redirectHost: loc ? new URL(loc, current).host : null, redirectPath: loc ? new URL(loc, current).pathname : null }));
    await res.body?.cancel();
    if (res.status >= 300 && res.status < 400 && loc) current = new URL(loc, current);
    else break;
  } catch (e) {
    console.log(JSON.stringify({ hop, host: current.host, error: String(e) }));
    break;
  }
}
