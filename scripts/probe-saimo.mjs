// scripts/probe-saimo.mjs — Node 20+/Bun; verificação não destrutiva das origens públicas.
const endpoints = [
  ["vod-fichas", "https://filmes-saimo.pages.dev/fichas.txt"],
  ["vod-indice", "https://filmes-saimo.pages.dev/indice.txt"],
  ["vod-destaques", "https://filmes-saimo.pages.dev/destaques.txt"],
  ["vod-series-part", "https://filmes-saimo.pages.dev/series-A-0.txt"],
  ["vod-filmes-letter", "https://filmes-saimo.pages.dev/filmes-A.txt"],
  ["vod-redeflix-movie", "https://filmes-saimo.pages.dev/redeflix/links-filmes.txt"],
  ["vod-animes", "https://filmes-saimo.pages.dev/animes-A-0.txt"],
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
      if (first.value) sample = new TextDecoder().decode(first.value.slice(0, 4096));
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
      formatHints: sample.split("\\n").slice(0, 40).reduce((acc, line) => {
        const kind = line.trim().startsWith("#EXTM3U") ? "m3u"
          : line.startsWith("base:") ? "base"
          : line.startsWith("canal:") ? "canal"
          : line.startsWith("fonte:") ? "fonte"
          : line.startsWith("@") ? "episode-header"
          : line.includes("\\t") ? `tsv-${line.split("\\t").length}-cols`
          : line.startsWith("#") ? "comment"
          : "other";
        acc[kind] = (acc[kind] || 0) + 1;
        return acc;
      }, {}),
    };
  } catch (error) {
    return { name, error: error instanceof Error ? error.name : String(error) };
  }
}

for (const [name, url] of endpoints) {
  console.log(JSON.stringify(await probe(name, url)));
}
