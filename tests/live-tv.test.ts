// tests/live-tv.test.ts — Bun; Saimo catalog, formats, fallback and media probes.
import { describe, test, expect, afterEach } from "bun:test";
import { classifyLiveSource, initialLiveMode, looksOffline, nextLiveMode } from "../src/lib/live-source";
import { mergeCanaisCatalogs, parseCanais, filterCanaisAndExtractCategories } from "../src/lib/canais";
import { handleLiveFormatApi } from "../src/lib/live-probe";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("Formatos Saimo", () => {
  test("classifica HLS, DASH, MPEG-TS e MP4 sem confundir tokens nas URLs", () => {
    expect(classifyLiveSource({ url: "https://x.example/stream/index.m3u8?token=xx" })).toBe("hls");
    expect(classifyLiveSource({ url: "https://x.example/live/main.mpd" })).toBe("dash");
    expect(classifyLiveSource({ url: "https://x.example/live/stream.ts" })).toBe("ts");
    expect(classifyLiveSource({ url: "https://x.example/live/movie.mp4" })).toBe("mp4");
    expect(classifyLiveSource({ url: "https://x.example/proxy?url=https%3A%2F%2Fcdn.example%2Fmaster.m3u8" })).toBe("hls");
    expect(classifyLiveSource({ url: "https://x.example/live?key=foo.ts" })).toBe("auto");
    expect(classifyLiveSource({ url: "https://x.example/live", chave: "a:b" })).toBe("dash");
  });

  test("prioriza proxy com Referer/UA e HTTP, testa rota alternativa após falha", () => {
    const source = { url: "https://cdn.example/live.m3u8", referer: "https://site.example/" };
    expect(initialLiveMode(source)).toBe("proxy");
    const attempts = new Set(["proxy"] as const);
    expect(nextLiveMode(source, "proxy", attempts)).toBe("direct");
    expect(nextLiveMode(source, "direct", new Set(["direct", "proxy"] as const))).toBeNull();
    expect(initialLiveMode({ url: "http://cdn.example/stream.m3u8" })).toBe("proxy");
    expect(nextLiveMode({ url: "http://cdn.example/stream.m3u8" }, "proxy", new Set(["proxy"] as const))).toBeNull();
  });

  test("descarta listas de erro declaradas mas preserva playlists úteis", () => {
    expect(looksOffline({ url: "https://cdn.example/stream/123/error.txt" })).toBe(true);
    expect(looksOffline({ url: "https://cdn.example/play/abc/index.m3u8" })).toBe(false);
    expect(looksOffline({ url: "https://cdn.example/list.txt" })).toBe(false);
  });
});

describe("Catalogo multiorigem", () => {
  test("mantém todos os canais distintos e agrega links alternativos do mesmo canal", () => {
    const source = parseCanais([
      "canal: Band", "categoria: TV Aberta", "fonte: https://cdn.one/live.m3u8",
      "canal: SBT", "categoria: TV Aberta", "fonte: https://cdn.one/sbt.m3u8",
    ].join("\n"));
    const m3u = parseCanais([
      "#EXTM3U", '#EXTINF:-1 group-title="TV Aberta",Band',
      "https://cdn.two/live.m3u8",
      '#EXTINF:-1 group-title="Infantil",Cartoon Network',
      "https://cdn.two/cartoon.m3u8",
    ].join("\n"));
    const merged = mergeCanaisCatalogs([source, m3u]);
    expect(merged).toHaveLength(3);
    expect(merged.find((ch) => ch.id === "band")?.fontes).toHaveLength(2);
    expect(merged.find((ch) => ch.id === "cartoon-network")?.categoria).toBe("Infantil");
  });
});

describe("Exibição de canais indisponíveis", () => {
  test("mantém o canal na lista quando só há error.txt", () => {
    const list = parseCanais([
      "canal: A&E", "categoria: Documentários",
      "fonte: https://cdn.example/stream/error.txt",
      "canal: Band", "categoria: TV Aberta",
      "fonte: https://cdn.example/band.m3u8",
    ].join("\n"));
    const filtered = filterCanaisAndExtractCategories(list);
    expect(filtered.canais).toHaveLength(2);
    expect(filtered.canais[0]?.id).toBe("a-e");
    expect(filtered.canais[0]?.fontes).toHaveLength(0);
    expect(filtered.canais[0]?.indisponivel).toBe(true);
    expect(filtered.canais[1]?.indisponivel).toBe(false);
  });
});

describe("Detecção MIME de fonte real via catálogo", () => {
  test("consulta somente fonte catalogada e identifica MP4 sem extensão", async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = String(input);
      seen.push(u);
      if (u.includes("canais-saimo.pages.dev/catalogo.txt")) {
        return new Response("canal: Canal Teste\nfonte: https://media.example/live?id=55\n");
      }
      if (u.includes("fontes-desativadas.json")) return new Response('{"desativados":[]}');
      if (u.includes("media.example")) return new Response("01", { status: 206, headers: { "content-type": "video/mp4" } });
      return new Response("missing", { status: 404 });
    }) as typeof fetch;
    const result = await handleLiveFormatApi(new URL("https://zangflix.example/api/live-format?canal=canal-teste&fonte=0"));
    expect(result.status).toBe(200);
    const json = await result.json() as { format: string };
    expect(json.format).toBe("mp4");
    expect(seen.some((u) => u.includes("media.example"))).toBe(true);
  });

  test("não permite consultar URL arbitrária nem índice inexistente", async () => {
    const invalid = await handleLiveFormatApi(new URL("https://zangflix.example/api/live-format?canal=http://internal&fonte=0"));
    expect(invalid.status).toBe(400);
    const missing = await handleLiveFormatApi(new URL("https://zangflix.example/api/live-format?canal=canal-teste&fonte=999"));
    expect(missing.status).toBe(404);
  });
});
