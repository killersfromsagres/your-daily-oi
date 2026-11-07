// tests/saimo-integration.test.ts — Bun 1.x; catálogos HTTP sem serviços reais.
import { describe, test, expect, afterEach } from "bun:test";
import { fetchFirstText, sourceUrls, SourceUnavailableError } from "../src/lib/saimo-source";
import { parseCanais, filterCanaisAndExtractCategories } from "../src/lib/canais";

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
