import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {qualityBadgePalette,type QualityTier} from "../src/lib/verified-media-quality";
import {observeQualityBadge} from "../src/lib/quality-badge-observer";
const read=(file:string)=>readFileSync(new URL(file,import.meta.url),"utf8");
const luminance=(hex:string)=>{
  const channels=[...hex.slice(1).matchAll(/[0-9a-f]{2}/gi)]
    .map(part=>parseInt(part[0],16)/255)
    .map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
  return .2126*channels[0]!+.7152*channels[1]!+.0722*channels[2]!;
};
const contrast=(fg:string,bg:string)=>{
  const x=luminance(fg),y=luminance(bg);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};
describe("Catalog badges stay legible and animations stay light",()=>{
  test("all quality ranks use opaque backgrounds with strong text contrast",()=>{
    const tiers:QualityTier[]=["low","sd","hd","hdplus","fullhd","qhd","4k","cam","unknown"];
    for(const tier of tiers){
      const palette=qualityBadgePalette(tier);
      expect(palette.background).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast(palette.color,palette.background)).toBeGreaterThanOrEqual(7);
    }
  });
  test("quality badge is readable over bright poster with no blur",()=>{
    const badge=read("../src/components/catalog/VerifiedQualityBadge.tsx");
    expect(badge).toContain('className={"zf-quality-badge "');
    expect(badge).toContain("opacity:1");
    expect(badge).toContain("backgroundColor:colors.background");
    expect(badge).toContain("subscribeQualityBadgeUpdates");
    expect(badge).toContain("observeQualityBadge");
    expect(badge).not.toContain("new IntersectionObserver");
    expect(badge).not.toContain('window.addEventListener(QUALITY_CHANGED_EVENT');
    expect(read("../src/styles/cards.css")).toContain("flex-wrap: wrap");
    expect(read("../src/styles/cards.css")).toContain(".ydo-card-badges .zf-quality-badge");
  });
  test("one shared IntersectionObserver serves many catalog badges",()=>{
    const previous=globalThis.IntersectionObserver;
    const instances:FakeObserver[]=[];
    class FakeObserver{
      private callback:IntersectionObserverCallback;
      observed=new Set<Element>();
      disconnects=0;
      constructor(callback:IntersectionObserverCallback){
        this.callback=callback;instances.push(this);
      }
      observe(el:Element){this.observed.add(el)}
      unobserve(el:Element){this.observed.delete(el)}
      disconnect(){this.disconnects++;this.observed.clear()}
      trigger(el:Element){this.callback([{target:el,isIntersecting:true} as IntersectionObserverEntry],
        this as unknown as IntersectionObserver);}
    }
    (globalThis as {IntersectionObserver?:unknown}).IntersectionObserver=FakeObserver;
    try{
      const one={} as Element,two={} as Element,three={} as Element;
      const hits:string[]=[];
      const off1=observeQualityBadge(one,()=>hits.push("one"));
      const off2=observeQualityBadge(two,()=>hits.push("two"));
      const off3=observeQualityBadge(three,()=>hits.push("three"));
      expect(instances.length).toBe(1);
      expect(instances[0]?.observed.size).toBe(3);
      instances[0]!.trigger(one);
      expect(hits).toEqual(["one"]);
      instances[0]!.trigger(one);
      expect(hits).toEqual(["one"]);
      off2();off3();off1();
      expect(instances[0]?.disconnects).toBeGreaterThan(0);
      observeQualityBadge({} as Element,()=>{} )();
      expect(instances.length).toBe(2);
    }finally{
      (globalThis as {IntersectionObserver?:unknown}).IntersectionObserver=previous;
    }
  });
  test("the hero uses responsive CDN delivery, cards reserve dimensions",()=>{
    const hero=read("../src/components/catalog/HeroSection.tsx");
    const card=read("../src/components/catalog/MediaCard.tsx");
    expect(hero).toContain('media="(max-width: 900px)"');
    expect(hero).toContain('"w1280"');
    expect(card).toContain("loading=\"lazy\"");
    expect(card).toContain("width={350}");
    expect(card).toContain("height={525}");
  });
  test("TV-only Anime navigation uses the manga icon, never a sparkle",()=>{
    const home=read("../src/routes/tv-home.tsx");
    const svg=read("../src/components/icons/TvAnimeFrameIcon.tsx");
    expect(home).toContain("<TvAnimeFrameIcon size={22}/>");
    expect(home).not.toContain("<Sparkles");
    expect(svg).toContain('<rect x="3" y="6"');
    expect(svg).toContain('fill="currentColor"');
    const root=read("../src/routes/__root.tsx");
    expect(root).not.toContain('href: tvCinemaCss');
  });
});
