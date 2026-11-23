import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
describe("TV-only cinematic experience",()=>{
  test("TV home uses compact metadata and reference-style hero + shelves",()=>{
    const s=read("../src/routes/tv-home.tsx");
    expect(s).toContain('"/api/catalogo?tv=1"');
    expect(s).toContain("<TvLibrary type={section} onOpen={openItem}/>");
    expect(s).toContain('className="zf-immersive-hero"');
    expect(s).toContain('className="zf-immersive-shelves"');
    expect(s).toContain("useTvFocus(");
    expect(s).not.toContain("installTvRemoteNavigation()");
    expect(s).not.toContain("getClientCatalog(");
  });
  test("TV remote sees only dedicated routes, not web header or web channel catalog",()=>{
    const root=read("../src/routes/__root.tsx");
    const home=read("../src/routes/tv-home.tsx");
    expect(root).toContain('["/tv-home", "/tv-live", "/tv-title"]');
    expect(root).toContain("!isDedicatedTvHome && !tvWatch && <Header />");
    expect(home).toContain('navigate({to:"/tv-live"})');
    const live=read("../src/routes/tv-live.tsx");
    expect(live).not.toContain("TvView");
    expect(live).toContain('className="zf-live-grid"');
    expect(live).toContain("useTvFocus(");
  });
  test("cinematic artwork is real catalog data and all CSS is scoped",()=>{
    const s=read("../src/routes/tv-home.tsx");
    const css=read("../src/styles/tv-cinema.css");
    expect(s).toContain("spotlight?.backdropUrl");
    expect(s).toContain("heroes[heroIndex]");
    expect(s).toContain("zf-tv-sidemenu");
    expect(css).toContain(".zf-immersive-hero");
    expect(css).toContain(".zf-tv-sidemenu:focus-within");
    expect(css).toContain(".zf-poster-tile[data-tv-focus]:focus");
    expect(css).not.toContain("backdrop-filter:");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
  });
  test("TV movie and live player return to dedicated UI",()=>{
    const live=read("../src/routes/tv-live.tsx");
    const detail=read("../src/routes/tv-title.tsx");
    expect(live).toContain("TvStreamPlayer key={active.id}");
    expect(live).toContain('data-tv-focus="player-back"');
    expect(detail).toContain('navigate({to:"/assistir/filme/$id"');
    expect(detail).toContain('navigate({to:"/tv-home"})');
  });
});
