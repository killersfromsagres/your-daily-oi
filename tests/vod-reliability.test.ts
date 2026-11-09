// tests/vod-reliability.test.ts — Bun; film, series, anime and provider failover regressions.
import { describe, expect, test, afterEach } from "bun:test";
import { parseSushiEpisodeSeasons, extractSushiMediaUrls } from "../src/lib/sushianimes";
import { buildSaimoVodPublicUrl, buildSaimoVodProxyUrl } from "../src/lib/saimo-vod-url";
import { resolveVodStreams } from "../src/lib/saimo-stream";

const savedFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = savedFetch; });

describe("Anime: season and episode parsing", () => {
  test("supports relative URLs, attribute reordering, and real episode numbers", () => {
    const html = [
      '<a class="epx-card" href="/anime/one-piece-1-season-12-episode"><div class="epx-title">12º Episódio</div></a>',
      '<a href="https://sushianimes.com.br/anime/one-piece-2-season-4-episode" class="epx-card">',
      ' <div class="epx-title">4º Episódio</div><div class="epx-desc">A aventura</div>',
      ' <img data-src="/img/e4.webp"></a>',
    ].join("");
    const seasons = parseSushiEpisodeSeasons(html);
    expect(seasons.map(s => s.seasonNumber)).toEqual([1,2]);
    expect(seasons[0]?.episodes[0]?.episodeNumber).toBe(12);
    expect(seasons[1]?.episodes[0]?.episodeNumber).toBe(4);
    expect(seasons[1]?.episodes[0]?.episodeSlug).toBe("one-piece-2-season-4-episode");
    expect(seasons[1]?.episodes[0]?.thumbUrl).toBe("https://sushianimes.com.br/img/e4.webp");
  });

  test("ignores other domains and duplicate episode cards", () => {
    const html = [
      '<a href="https://evil.example/anime/a-1-season-1-episode">wrong host</a>',
      '<a href="/anime/a-1-season-1-episode">first card</a>',
      '<a href="/anime/a-1-season-1-episode">duplicate</a>',
    ].join("");
    expect(parseSushiEpisodeSeasons(html)[0]?.episodes).toHaveLength(1);
    expect(parseSushiEpisodeSeasons('<p>No episodes</p>')).toEqual([]);
  });
});

describe("Anime: embedded source formats", () => {
  test("extracts a playable source from HTML and JSON-escaped media strings", () => {
    const html = '<script>playerEmbed="https://cdn.example.com/a.m3u8?token=abc";</script>';
    expect(extractSushiMediaUrls(html)).toEqual(["https://cdn.example.com/a.m3u8?token=abc"]);
    const json = JSON.stringify({html:"<video src=\"https://cdn.example.com/b.mp4\" />"});
    expect(extractSushiMediaUrls(json)).toContain("https://cdn.example.com/b.mp4");
    const escaped = '{"url":"https:\\/\\/cdn.example.com\\/c.m3u8"}';
    expect(extractSushiMediaUrls(escaped)).toContain("https://cdn.example.com/c.m3u8");
  });
  test("does not report an HTML iframe page as a direct video", () => {
    expect(extractSushiMediaUrls('<iframe src="https://player.example/embed/123"></iframe>')).toEqual([]);
    expect(extractSushiMediaUrls('http://cdn.example.com/movie.mp4')).toEqual([]);
  });
});

describe("Film player", () => {
  test("preserves audio and id in direct and proxy fallback URLs", () => {
    const args = { tipo: "movie" as const, id: "550", versao: "leg" as const };
    const direct = new URL(buildSaimoVodPublicUrl(args));
    expect(direct.origin).toBe("https://saimo-tv.pages.dev");
    expect(direct.searchParams.get("id")).toBe("550");
    expect(direct.searchParams.get("versao")).toBe("leg");
    expect(buildSaimoVodProxyUrl(args)).toBe("/api/saimo-vod?tipo=movie&id=550&versao=leg");
  });
});

describe("Independent provider resolution", () => {
  test("queries Saimo, catalog and backup endpoints concurrently", async () => {
    const hit = new Set<string>();
    let backupsStarted = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("saimo-tv.pages.dev/api/stream")) {
        hit.add("saimo");
        // Other providers must have been dispatched while this response waited.
        await new Promise(resolve => setTimeout(resolve, 60));
        backupsStarted = hit.has("fenix") && hit.has("redeflix");
        return new Response(null,{status:302,headers:{Location:"https://cdn.example.com/movie.mp4"}});
      }
      if (url.includes("fenixflix")) {
        hit.add("fenix");
        return Response.json({streams:[{url:"https://backup.example.com/movie.mp4",name:"Backup"}]});
      }
      if (url.includes("redeflix")) {hit.add("redeflix");return new Response("none",{status:404});}
      return new Response("none",{status:404});
    }) as typeof fetch;
    const sources = await resolveVodStreams({
      tipo:"movie", id:"99811221", tmdbId:99811221,
    });
    expect(backupsStarted).toBe(true);
    expect(sources.some(s => s.url === "https://backup.example.com/movie.mp4")).toBe(true);
    expect(sources.some(s => s.url.startsWith("/api/saimo-vod?"))).toBe(true);
  });
});
