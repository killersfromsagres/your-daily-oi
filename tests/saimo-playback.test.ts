// tests/saimo-playback.test.ts — Bun; mocks exercise the actual MP4 302->206 pipeline.
import { describe, test, expect, afterEach } from "bun:test";
import { buildSaimoVodProxyUrl, parseSaimoVodParams, proxyUrlForSaimoRelay } from "../src/lib/saimo-vod-url";
import { handleSaimoVodProxy, rewriteVodHlsManifest } from "../src/lib/saimo-vod-proxy";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("Saimo VOD URL", () => {
  test("converte endpoint público em URL local sem perder ID/idioma", () => {
    expect(proxyUrlForSaimoRelay("https://saimo-tv.pages.dev/api/stream?tipo=movie&id=550&versao=leg"))
      .toBe("/api/saimo-vod?tipo=movie&id=550&versao=leg");
    expect(proxyUrlForSaimoRelay("https://fake.example/api/stream?tipo=movie&id=550")).toBeNull();
    expect(buildSaimoVodProxyUrl({ tipo: "series", id: "1396", versao: "dub", temp: 1, ep: 2 }))
      .toBe("/api/saimo-vod?tipo=series&id=1396&versao=dub&temp=1&ep=2");
  });

  test("rejeita IDs e episódios inválidos", () => {
    expect(parseSaimoVodParams(new URLSearchParams("tipo=movie&id=../../internal"))).toBeNull();
    expect(parseSaimoVodParams(new URLSearchParams("tipo=series&id=1396&temp=-1"))).toBeNull();
    expect(parseSaimoVodParams(new URLSearchParams("tipo=movie&id=550&temp=nan"))).toBeNull();
  });
});

describe("Proxy de reprodução MP4", () => {
  test("segue 302 e preserva 206 Content-Range e bytes para seek", async () => {
    const requests: { url: string; range: string | null; redirect: string | undefined }[] = [];
    globalThis.fetch = (async (target: RequestInfo | URL, options?: RequestInit) => {
      const url = String(target);
      const headers = new Headers(options?.headers);
      requests.push({ url, range: headers.get("Range"), redirect: options?.redirect });
      if (url.includes("saimo-tv.pages.dev")) {
        return new Response(null, { status: 302, headers: {
          Location: "https://movie-cdn.example.com/media/fight-club",
        } });
      }
      return new Response("01", { status: 206, headers: {
        "Content-Type": "video/mp4",
        "Content-Range": "bytes 0-1/3108766068",
        "Content-Length": "2",
        "Accept-Ranges": "bytes",
      } });
    }) as typeof fetch;

    const request = new Request("https://zangflix.example/api/saimo-vod?tipo=movie&id=550&versao=dub", {
      headers: { Range: "bytes=0-1" },
    });
    const response = await handleSaimoVodProxy(request);
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-range")).toBe("bytes 0-1/3108766068");
    expect(await response.text()).toBe("01");
    expect(requests).toHaveLength(2);
    expect(requests.map((r) => r.range)).toEqual(["bytes=0-1", "bytes=0-1"]);
    expect(requests.every((r) => r.redirect === "manual")).toBe(true);
  });

  test("modo probe informa formato sem baixar mídia", async () => {
    globalThis.fetch = (async () => new Response("12", { status: 206, headers: {
      "Content-Type": "video/mp4",
      "Content-Range": "bytes 0-1/123456",
    } })) as typeof fetch;
    const response = await handleSaimoVodProxy(new Request(
      "https://zangflix.example/api/saimo-vod?tipo=movie&id=550&probe=1",
    ));
    expect((await response.json()).format).toBe("mp4");
  });

  test("falha em HTML de bloqueio em vez de encaminhá-lo como vídeo", async () => {
    globalThis.fetch = (async () => new Response("<html>blocked</html>", {
      headers: { "Content-Type": "text/html" },
    })) as typeof fetch;
    const response = await handleSaimoVodProxy(new Request(
      "https://zangflix.example/api/saimo-vod?tipo=movie&id=550",
    ));
    expect(response.status).toBe(502);
  });

  test("não segue redirecionamento para rede local", async () => {
    globalThis.fetch = (async () => new Response(null, {
      status: 302, headers: { Location: "http://127.0.0.1/internal" },
    })) as typeof fetch;
    const response = await handleSaimoVodProxy(new Request(
      "https://zangflix.example/api/saimo-vod?tipo=movie&id=550",
    ));
    expect(response.status).toBe(502);
  });
});

describe("Proxy HLS", () => {
  test("reescreve chaves e segmentos relativos sob mesma origem", () => {
    const source = [
      "#EXTM3U",
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
      "#EXTINF:6.0,",
      "segment_001.ts",
    ].join("\n");
    const rewritten = rewriteVodHlsManifest(source, "https://cdn.example.com/path/playlist.m3u8");
    expect(rewritten).toContain(encodeURIComponent("https://cdn.example.com/path/key.bin"));
    expect(rewritten).toContain(encodeURIComponent("https://cdn.example.com/path/segment_001.ts"));
    expect(rewritten).not.toContain("\nsegment_001.ts");
  });

  test("serve playlist HLS com URL de segmentos reescrita", async () => {
    globalThis.fetch = (async () => new Response("#EXTM3U\n#EXTINF:6,\nseg.ts\n", {
      headers: { "Content-Type": "application/vnd.apple.mpegurl" },
    })) as typeof fetch;
    const response = await handleSaimoVodProxy(new Request(
      "https://zangflix.example/api/saimo-vod?tipo=movie&id=550",
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("mpegurl");
    expect(await response.text()).toContain("/api/live-proxy?url=");
  });
});
