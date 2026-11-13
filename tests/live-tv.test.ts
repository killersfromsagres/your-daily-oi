// tests/live-tv.test.ts — Bun; Saimo catalog, formats, fallback and media probes.
import { describe, test, expect, afterEach } from "bun:test";
import { buildLiveProxyPath, classifyLiveSource, initialLiveMode, isLivePlaylistTarget, liveSourceFingerprint, looksOffline, nextLiveMode, orderLiveSources } from "../src/lib/live-source";
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

  test("usa primeiro o navegador em HTTPS como Saimo, com proxy de fallback", () => {
    const source = { url: "https://cdn.example/live.m3u8", referer: "https://site.example/" };
    expect(initialLiveMode(source)).toBe("direct");
    expect(nextLiveMode(source, "direct", new Set(["direct"] as const))).toBe("proxy");
    expect(nextLiveMode(source, "proxy", new Set(["direct", "proxy"] as const))).toBeNull();
    expect(initialLiveMode({ url: "https://d1.s25-cloudfront-net.lat/live/index.m3u8", agente: "UA" })).toBe("direct");
    expect(initialLiveMode({ url: "https://cdn.example/playlist.txt" })).toBe("proxy");
    expect(initialLiveMode({ url: "https://dadinhodetapioca.fun/live.m3u8" })).toBe("proxy");
    expect(initialLiveMode({ url: "http://cdn.example/stream.m3u8" })).toBe("proxy");
    expect(nextLiveMode({ url: "http://cdn.example/stream.m3u8" }, "proxy", new Set(["proxy"] as const))).toBeNull();
  });

  test("descarta listas de erro declaradas mas preserva playlists úteis", () => {
    expect(looksOffline({ url: "https://cdn.example/stream/123/error.txt" })).toBe(true);
    expect(looksOffline({ url: "https://cdn.example/play/abc/index.m3u8" })).toBe(false);
    expect(looksOffline({ url: "https://cdn.example/list.txt" })).toBe(false);
  });
});

describe("Compatibilidade Vercel com proxy legado", () => {
  const fonte = {
    url: "https://cdn.example/stream.m3u8?token=a&b=1",
    referer: "https://embed.example/watch/",
    agente: "Chrome/124",
  };

  test("usa a rota catalogada em backend atualizado", () => {
    const path = buildLiveProxyPath("amazon-prime-video-01", 0, fonte, true);
    const parsed = new URL(path, "https://zangflix.vercel.app");
    expect(parsed.pathname).toBe("/api/tv/stream");
    expect(parsed.searchParams.get("canal")).toBe("amazon-prime-video-01");
    expect(parsed.searchParams.get("fonte")).toBe("0");
    expect(parsed.searchParams.get("assinatura")).toBe(liveSourceFingerprint(fonte.url));
  });

  test("a assinatura é estável entre cliente e servidor, inclusive com URLs assinadas", () => {
    const first = liveSourceFingerprint(fonte.url);
    expect(first).toMatch(/^[a-f0-9]{8}$/);
    expect(first).toBe(liveSourceFingerprint(fonte.url));
    expect(first).not.toBe(liveSourceFingerprint(fonte.url + "&v=2"));
  });

  test("troca para a rota legada quando o deploy não tem /api/tv/stream", () => {
    const path = buildLiveProxyPath("amazon-prime-video-01", 0, fonte, false);
    const url = new URL(path, "https://zangflix.vercel.app");
    expect(url.pathname).toBe("/api/live-proxy");
    expect(url.searchParams.get("url")).toBe(fonte.url);
    expect(url.searchParams.get("referer")).toBe(fonte.referer);
    expect(url.searchParams.get("ua")).toBe(fonte.agente);
  });

  test("fontes externas sem índice também utilizam o proxy legado", () => {
    const path = buildLiveProxyPath("band", -1, fonte, true);
    expect(path.startsWith("/api/live-proxy?")).toBe(true);
  });
});


describe("Reescrita de playlists com HTTP Range", () => {
  test("identifica manifestos HLS, DASH e TXT, mesmo com parâmetros", () => {
    expect(isLivePlaylistTarget("http://cdn.example/hbo/index.m3u8?token=xyz")).toBe(true);
    expect(isLivePlaylistTarget("https://cdn.example/master.mpd")).toBe(true);
    expect(isLivePlaylistTarget("https://cdn.example/list.txt")).toBe(true);
    expect(isLivePlaylistTarget("https://proxy.example/stream?url=https%3A%2F%2Fcdn.example%2Fhbo%2Fmaster.m3u8")).toBe(true);
  });

  test("preserva requisições Range de segmentos MPEG-TS e MP4", () => {
    expect(isLivePlaylistTarget("https://cdn.example/seg/123.ts")).toBe(false);
    expect(isLivePlaylistTarget("https://cdn.example/chunk.m4s")).toBe(false);
    expect(isLivePlaylistTarget("https://cdn.example/movie.mp4")).toBe(false);
    expect(isLivePlaylistTarget("file:///private/master.m3u8")).toBe(true);
  });
});

describe("Priorização de espelhos em canais fechados", () => {
  const degraded = { url: "https://d3-test.cdn13embed.xyz/hbo/index.m3u8", qualidade: "FHD" };
  const alternate = { url: "http://138.204.86.4/HBO/index.m3u8", qualidade: "HD" };

  test("prioriza fonte alternativa de HBO diante do CDN 403", () => {
    const ordered = orderLiveSources([degraded, alternate]);
    expect(ordered[0]).toBe(alternate);
    expect(ordered[1]).toBe(degraded);
    expect(initialLiveMode(ordered[0])).toBe("proxy");
  });

  test("mantém o CDN original como último recurso, mesmo quando bloqueado em outra região", () => {
    const ordered = orderLiveSources([degraded]);
    expect(ordered).toEqual([degraded]);
  });

  test("não altera a ordem de fontes sem CDN problemático", () => {
    const first = { url: "https://cdn.example/stream.m3u8" };
    const second = { url: "https://backup.example/stream.m3u8" };
    expect(orderLiveSources([first, second])).toEqual([first, second]);
  });

  test("não reordena por caminho quando o host contém a palavra CDN em URL", () => {
    const first = { url: "https://cdn.example/redirect/cdn13embed.xyz/master.m3u8" };
    const second = { url: "https://backup.example/stream.m3u8" };
    expect(orderLiveSources([first, second])[0]).toBe(first);
  });
});

describe("Categorias IPTV e TXT normalizadas", () => {
  test("junta ESPORTES, ESPN e filmes de listas M3U às categorias de origem", () => {
    const m3u = parseCanais([
      "#EXTM3U",
      '#EXTINF:-1 group-title="ESPORTES",COMBATE (S46)',
      "http://tv.example/combate.ts",
      '#EXTINF:-1 group-title="ESPN",ESPN (S46)',
      "http://tv.example/espn.ts",
      '#EXTINF:-1 group-title="FILMES E SÉRIES",Telecine Action (S46)',
      "http://tv.example/telecine.ts",
    ].join("\n"));
    expect(m3u.map(c => c.categoria)).toEqual(["Esportes", "Esportes", "Filmes e Séries"]);
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
    expect(filtered.canais[0]?.id).toBe("a-e-e");
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
