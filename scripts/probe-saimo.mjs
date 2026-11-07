// scripts/probe-saimo.mjs — Node 20+/Bun; verificação não destrutiva das origens públicas.
const endpoints = [
  ["vod-fichas", "https://filmes-saimo.pages.dev/fichas.txt"],
  ["vod-indice", "https://filmes-saimo.pages.dev/indice.txt"],
  ["vod-destaques", "https://filmes-saimo.pages.dev/destaques.txt"],
  ["tv-catalogo", "https://canais-saimo.pages.dev/catalogo.txt"],
  ["tv-radios", "https://canais-saimo.pages.dev/radios.txt"],
  ["saimo-stream", "https://saimo-tv.pages.dev/api/stream?tipo=movie&id=550&versao=dub"],
];

async function probe(name, url) {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "text/plain, application/json, */*" },
    });
    const location = response.headers.get("location");
    const reader = response.body?.getReader();
    let sample = "";
    if (reader) {
      const first = await reader.read();
      if (first.value) sample = new TextDecoder().decode(first.value.slice(0, 256));
      await reader.cancel();
    }
    return {
      name,
      status: response.status,
      contentType: response.headers.get("content-type"),
      redirectHost: location ? new URL(location, url).hostname : null,
      looksLikeHtml: /^\s*<(?:!doctype\s+html|html|head|body)\b/i.test(sample),
      looksLikeM3u: sample.trimStart().startsWith("#EXTM3U"),
      firstBytes: sample.length,
    };
  } catch (error) {
    return { name, error: error instanceof Error ? error.name : String(error) };
  }
}

for (const [name, url] of endpoints) {
  console.log(JSON.stringify(await probe(name, url)));
}
