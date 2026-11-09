// tests/vod-source-quality.test.ts — Bun 1.x; production player ranking and rejection regressions.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import type { StreamSource } from "../src/lib/types";
import {
  advertisedVodResolution, bestVodSourceIndex, nextVodSourceIndex,
  playableVodSources, rejectedVodSourceReason, vodSourceScore, shortlistVodSources,
} from "../src/lib/vod-source-quality";
import { detectVodQuality } from "../src/lib/saimo-stream";
import { cleanDisplayTitle, catalogDisplayTitle } from "../src/lib/catalog";

const source = (url: string, audio: "dub"|"leg", quality: string, name = "", priority = 1,
  audioDeclared = true): StreamSource => ({url,audio,quality,name,priority,audioDeclared,format:"mp4"});

describe("Seleção automática do melhor servidor", () => {
  test("seleciona português dublado mesmo quando o legendado diz 4K", () => {
    const sources = [
      source("https://cdn.test/4k.mp4","leg","4K","Original"),
      source("https://cdn.test/1080.mp4","dub","1080p","Dublado"),
      source("https://cdn.test/720.mp4","dub","720p","Dublado"),
    ];
    expect(bestVodSourceIndex(sources,{preferredAudio:"dub"})).toBe(1);
  });

  test("catálogo direto dublado vence relays especulativos e mantém alternativas curtas", () => {
    const sources = [
      source("https://cdn.test/unknown-1080p.mp4","dub","1080p","Fonte genérica"),
      source("https://cdn.test/catalog.mp4","dub","Auto","Catálogo (DUB)"),
      source("https://cdn.test/720p.mp4","leg","720p","Legendas"),
    ];
    expect(bestVodSourceIndex(sources)).toBe(1);
    expect(shortlistVodSources(sources,2).length).toBe(2);
    expect(shortlistVodSources(sources,2)[0]?.name).toBe("Catálogo (DUB)");
  });

  test("melhor resolução dublada ganha mesmo se o relay é o primeiro na lista", () => {
    const sources = [
      source("/api/saimo-vod?tipo=movie&id=99&versao=dub","dub","Auto","Padrão",-20),
      source("https://cdn.test/720p.mp4","dub","720p","HD"),
      source("https://cdn.test/1080p.mp4","dub","1080p","Full HD"),
    ];
    expect(bestVodSourceIndex(sources)).toBe(2);
  });

  test("audio realmente rotulado tem prioridade sobre inferência incerta", () => {
    const sources = [
      source("https://cdn.test/not-verified.mp4","dub","1080p","Unknown",1,false),
      source("https://cdn.test/confirmed.mp4","dub","720p","Português dublado",1,true),
    ];
    expect(bestVodSourceIndex(sources)).toBe(1);
  });

  test("resolução medida tem prioridade sobre propaganda 4K na URL", () => {
    const sources = [
      source("https://cdn.test/claimed-4k.mp4","dub","4K","4K"),
      source("https://cdn.test/real-1080p.mp4","dub","1080p","1080p"),
    ];
    const heights = new Map([[sources[0]!.url, 360],[sources[1]!.url,1080]]);
    expect(bestVodSourceIndex(sources,{observedHeights:heights})).toBe(1);
  });

  test("lembrança de falha deixa alternativa saudável na frente", () => {
    const sources = [
      source("https://cdn.test/a-1080p.mp4","dub","1080p"),
      source("https://cdn.test/b-720p.mp4","dub","720p"),
    ];
    expect(bestVodSourceIndex(sources,{failedUrls:new Set([sources[0]!.url])})).toBe(1);
    expect(nextVodSourceIndex(sources,0,new Set())).toBe(1);
    expect(nextVodSourceIndex(sources,0,new Set([sources[1]!.url]))).toBe(-1);
  });

  test("prioridade de episódio exato não força CAM ou anúncios", () => {
    const sources = [
      source("https://cdn.test/filme-hdcam.mp4","dub","1080p","Episódio", -250),
      source("https://cdn.test/1xbet/movie.mp4","dub","1080p","Episódio",-250),
      source("https://cdn.test/webdl.mp4","dub","720p","Web DL",2),
    ];
    expect(playableVodSources(sources).map(s=>s.url)).toEqual(["https://cdn.test/webdl.mp4"]);
    expect(bestVodSourceIndex(sources)).toBe(2);
  });

  test("nem mp4/ts, nem palavras inocentes são confundidas com captação de cinema", () => {
    const good = [
      source("https://cdn.test/part001.ts","dub","Auto","HLS transport"),
      source("https://cdn.test/Camila-1080p.mp4","dub","1080p","Camila"),
      source("https://cdn.test/batman.mp4","dub","Auto","Batman"),
      source("https://cdn.test/movie.web-dl.mp4","dub","1080p","WEB-DL"),
    ];
    expect(good.map(rejectedVodSourceReason)).toEqual([null,null,null,null]);
  });

  test("exclui etiquetas CAM/TS, áudio de cinema e marcas de apostas", () => {
    const bad = [
      source("https://cdn.test/a.mp4","dub","HDTS","Filme"),
      source("https://cdn.test/a.mp4","dub","1080p","Gravado no cinema"),
      source("https://cdn.test/a.mp4","dub","1080p","1XBET watermark"),
      source("https://cdn.test/movies/22bet/movie.mp4","dub","720p"),
      source("https://cdn.test/a.mp4","dub","1080p","Cinema Audio"),
    ];
    expect(bad.map(s=>rejectedVodSourceReason(s))).toEqual(["cinema","cinema","ads","ads","cinema"]);
    expect(bestVodSourceIndex(bad)).toBe(-1);
  });

  test("sem metadados reais não inventa 1080p", () => {
    expect(detectVodQuality("https://cdn.test/movie.mp4","Server")).toBe("Auto");
    expect(detectVodQuality("https://cdn.test/a-720p.mp4","Server")).toBe("720p");
    expect(advertisedVodResolution(source("https://cdn.test/movie.mp4","dub","Auto"))).toBeNull();
  });
});

describe("Títulos legíveis do catálogo", () => {
  test("corrige sinais de mais codificados e nomes dos destaques", () => {
    expect(cleanDisplayTitle("+velozes +furiosos")).toBe("velozes furiosos");
    expect(cleanDisplayTitle("Velozes+e+Furiosos")).toBe("Velozes e Furiosos");
    expect(cleanDisplayTitle("%2BVelozes%20%2BFuriosos")).toBe("Velozes Furiosos");
  });
  test("TMDB 385687 é exibido como Velozes & Furiosos 10", () => {
    expect(catalogDisplayTitle({title:"+velozes +furiosos",tmdbId:385687,tmdb:null}))
      .toBe("Velozes & Furiosos 10");
  });
});

describe("Consistência dos players", () => {
  test("filmes, séries e animes usam o seletor compartilhado", () => {
    const base = new URL("../src/routes/",import.meta.url);
    for (const filename of ["assistir.filme.$id.tsx","assistir.serie.$id.$temp.$ep.tsx","assistir.anime.$id.$temp.$ep.tsx"]) {
      const contents=readFileSync(new URL(filename,base),"utf8");
      expect(contents).toContain("<OwnPlayer");
    }
    const player=readFileSync(new URL("../src/components/player/OwnPlayer.tsx",import.meta.url),"utf8");
    expect(player).toContain("playableVodSources(streams)");
    expect(player).toContain("nextVodSourceIndex(");
    expect(player).toContain("video.videoHeight");
  });
});
