// tests/saimo-integration.test.ts — Bun 1.x; catálogos HTTP sem serviços reais.
import { describe, test, expect, afterEach } from "bun:test";
import { fetchFirstText, sourceUrls, SourceUnavailableError } from "../src/lib/saimo-source";
import { parseCanais, filterCanaisAndExtractCategories } from "../src/lib/canais";
import { loadCatalog, getStreamsForItem, getSeasonsForSeries } from "../src/lib/catalog";
import { resolveVodStreams } from "../src/lib/saimo-stream";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("Fontes de catálogo", () => {
  test("normaliza espelhos e remove duplicatas", () => {
    expect(sourceUrls("https://a.example/;https://a.example,https://b.example", [
      "https://c.example/",
    ])).toEqual(["https://a.example", "https://b.example", "https://c.example"]);
  });

  test("ignora URL HTTP e passa ao próximo espelho quando o primeiro falha", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(calls.length === 1 ? "não encontrado" : "canal: Teste\nfonte: https://cdn.example/live.m3u8", {
        status: calls.length === 1 ? 404 : 200,
      });
    }) as typeof fetch;
    const data = await fetchFirstText([
      "http://inseguro.example", "https://a.example/catalogo.txt", "https://b.example/catalogo.txt",
    ], "canais");
    expect(calls).toHaveLength(2);
    expect(data.url).toBe("https://b.example/catalogo.txt");
    expect(data.text).toContain("canal: Teste");
  });

  test("não aceita página HTML de bloqueio como catálogo", async () => {
    globalThis.fetch = (async () => new Response("<!doctype html><html>Indisponível</html>")) as typeof fetch;
    expect(fetchFirstText(["https://a.example/fichas.txt"], "filmes"))
      .rejects.toBeInstanceOf(SourceUnavailableError);
  });

  test("retorna erro estruturado quando todas as fontes falham", async () => {
    globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch;
    await expect(fetchFirstText(["https://a.example/fichas.txt"], "VOD"))
      .rejects.toThrow("HTTP 503");
  });
});

describe("TV online", () => {
  test("preserva formato Saimo de canais e múltiplas fontes", () => {
    const result = parseCanais([
      "canal: Canal Teste", "categoria: Notícias", "logo: https://example.com/logo.png",
      "fonte: https://cdn.example/live.m3u8", "referer: https://saimo-tv.pages.dev",
      "fonte: https://cdn2.example/live.m3u8", "qualidade: HD",
    ].join("\n"));
    expect(result).toHaveLength(1);
    expect(result[0]?.fontes).toHaveLength(2);
    expect(result[0]?.fontes[0]?.referer).toBe("https://saimo-tv.pages.dev");
  });

  test("interpreta playlist M3U e agrega fontes alternativas", () => {
    const result = parseCanais([
      "#EXTM3U",
      '#EXTINF:-1 tvg-logo="https://example.org/logo.png" group-title="Esportes",Canal X',
      "#EXTVLCOPT:http-referrer=https://example.org/",
      "https://cdn.example/1.m3u8",
      '#EXTINF:-1 group-title="Esportes",Canal X',
      "http://cdn.example/2.m3u8",
    ].join("\n"));
    expect(result).toHaveLength(1);
    expect(result[0]?.fontes).toHaveLength(2);
    expect(result[0]?.fontes[0]?.referer).toBe("https://example.org/");
    expect(result[0]?.categoria).toBe("Esportes");
    expect(result[0]?.logo).toBe("https://example.org/logo.png");
  });

  test("filtra apenas hosts explicitamente desativados", () => {
    const list = parseCanais([
      "canal: Jornal", "fonte: https://live.good.example/playlist.m3u8",
      "fonte: https://offline.example/live.m3u8",
    ].join("\n"));
    const result = filterCanaisAndExtractCategories(list, ["offline.example"]);
    expect(result.canais).toHaveLength(1);
    expect(result.canais[0]?.fontes).toHaveLength(1);
    expect(result.canais[0]?.fontes[0]?.url).toContain("good.example");
  });
});

describe("Fluxo real VOD: fichas, filmes, episódios e redirecionamento", () => {
  test("carrega itens, um filme, uma temporada e fonte Saimo simulados", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("/fichas.txt")) return new Response(
        "f\tFilme Teste\t550\t/poster.jpg\tDrama\ns\tSerie Teste\t42\t/poster2.jpg\tDrama\n",
      );
      if (url.includes("/destaques.txt")) return new Response("Em alta\n");
      if (url.includes("/indice.txt")) return new Response("base:0 https://cdn.example/\n");
      if (url.endsWith("/filmes-F.txt")) return new Response(
        "Filme Teste\tdub=https://cdn.example/filme.mp4\tleg=https://cdn.example/filme-leg.m3u8",
      );
      if (url.endsWith("/series-S-0.txt")) return new Response(
        "@Serie Teste\t2026\n1\t1\tdub\thttps://cdn.example/episodio.mp4\n",
      );
      if (url.includes("/api/stream")) return new Response(null, {
        status: 302,
        headers: { Location: "https://media.example/video.m3u8" },
      });
      return new Response("não encontrado", { status: 404 });
    }) as typeof fetch;

    const catalog = await loadCatalog();
    expect([...catalog.items.values()].some((item) => item.title === "Filme Teste")).toBe(true);
    expect([...catalog.items.values()].some((item) => item.title === "Serie Teste")).toBe(true);

    const movieStreams = await getStreamsForItem("f", "Filme Teste");
    expect(movieStreams.map((stream) => stream.audio)).toEqual(["dub", "leg"]);
    const seasons = await getSeasonsForSeries("Serie Teste");
    expect(seasons[0]?.episodes[0]?.streams[0]?.url).toBe("https://cdn.example/episodio.mp4");

    const streams = await resolveVodStreams({
      tipo: "movie", id: "550", title: "Filme Teste", tmdbId: 550,
    });
    expect(streams.some((source) => source.url === "https://media.example/video.m3u8")).toBe(true);
    expect(streams.some((source) => source.audio === "leg")).toBe(true);
    expect(requests.filter((url) => url.endsWith("series-S-0.txt"))).toHaveLength(1);
  });
});
