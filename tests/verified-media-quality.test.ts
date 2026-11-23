import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {camCaptureEvidence,describeMediaQuality,qualityFromDimensions,qualityLabelForHeight,
  qualityBadgePalette,tierFromQualityLabel,qualityKey,
  readVerifiedMediaQuality,sourceFingerprint,writeVerifiedMediaQuality} from "../src/lib/verified-media-quality";
const read=(file:string)=>readFileSync(new URL(file,import.meta.url),"utf8");
const source=(url:string,name="",quality="")=>({url,name,quality});
describe("Truthful quality badges for all VOD media",()=>{
  test("observed real raster provides HD, FHD, QHD and UHD tier",()=>{
    expect(qualityFromDimensions(1280,720)?.label).toBe("HD");
    expect(qualityFromDimensions(1920,1080)?.label).toBe("FULL HD");
    expect(qualityFromDimensions(2560,1440)?.label).toBe("FULL HD+");
    expect(qualityFromDimensions(3840,2160)?.label).toBe("4K UHD");
    expect(qualityFromDimensions(3840,1600)?.label).toBe("4K UHD");
    expect(qualityFromDimensions(1920,800)?.label).toBe("HD+");
    expect(qualityFromDimensions(720,1280)?.label).toBe("HD");
    expect(qualityFromDimensions(854,480)?.label).toBe("SD");
    expect(qualityFromDimensions(640,360)?.label).toBe("BAIXA");
    expect(qualityFromDimensions(0,0)).toBeNull();
  });
  test("tier cutoffs follow the requested public names and progressive color",()=>{
    expect(qualityLabelForHeight(719)?.label).toBe("SD");
    expect(qualityLabelForHeight(720)?.label).toBe("HD");
    expect(qualityLabelForHeight(799)?.label).toBe("HD");
    expect(qualityLabelForHeight(800)?.label).toBe("HD+");
    expect(qualityLabelForHeight(816)?.label).toBe("HD+");
    expect(qualityLabelForHeight(1079)?.label).toBe("HD+");
    expect(qualityLabelForHeight(1080)?.label).toBe("FULL HD");
    expect(qualityLabelForHeight(1440)?.label).toBe("FULL HD+");
    expect(qualityLabelForHeight(2160)?.label).toBe("4K UHD");
    expect(tierFromQualityLabel("HD 800p")).toBe("hdplus");
    expect(tierFromQualityLabel("FULL HD 1080p")).toBe("fullhd");
    expect(qualityBadgePalette("hd").background).not.toBe(qualityBadgePalette("hdplus").background);
    expect(qualityBadgePalette("fullhd").color).not.toBe(qualityBadgePalette("4k").color);
    const badge=read("../src/components/catalog/VerifiedQualityBadge.tsx");
    expect(badge).not.toContain('label:"SEM DADOS"');
    expect(badge).toContain("qualityBadgePalette(display.tier)");
  });
  test("legacy observed 800p cache migrates to HD+ without corrupting episode key",()=>{
    const now=Date.now(),saved=new Map<string,string>();
    saved.set("zangflix:verified-video-resolution:v1",JSON.stringify({
      "f:old-film":{tier:"hd",label:"HD 800p",width:1920,height:800,observedAt:now,
        sourceFingerprint:"abc"},
    }));
    const old=readVerifiedMediaQuality({type:"f",id:"old-film"},
      {getItem:(key)=>saved.get(key)??null});
    expect(old).toMatchObject({tier:"hdplus",label:"HD+",width:1920,height:800});
  });
  test("claims in titles or source metadata never constitute verified pixels",()=>{
    const high=describeMediaQuality([source("https://cdn.test/film.4K.m3u8","Ultra 4K","4K")],null);
    expect(high).toMatchObject({label:"4K UHD",verified:false});
    expect(camCaptureEvidence([source("https://cdn.test/movie.ts","MPEG-TS","1080p")])).toBe(false);
    expect(camCaptureEvidence([source("https://cdn.test/movie.HDCAM.mp4","Filmagem de cinema")])).toBe(true);
    expect(describeMediaQuality([source("https://cdn.test/movie.camrip.mp4")],null))
      .toMatchObject({label:"CAM · CINEMA",verified:false});
    expect(describeMediaQuality([
      source("https://cdn.test/movie.camrip.mp4"),
      source("https://cdn.test/clean.mp4"),
    ],null).label).toBe("A VERIFICAR");
  });
  test("measured resolution wins over contradictory advertised 4K",()=>{
    const verified={...qualityFromDimensions(1280,720)!,observedAt:Date.now(),sourceFingerprint:"abc"};
    expect(describeMediaQuality([source("https://cdn.test/film.4K.mp4","","4K")],verified).label).toBe("HD");
  });
  test("episode-specific cache stores measured values; last episode doesn't claim all are FHD",()=>{
    const mem=new Map<string,string>();
    const storage={getItem:(k:string)=>mem.get(k)??null,setItem:(k:string,v:string)=>{mem.set(k,v)}};
    const key={type:"s" as const,id:"test-series",season:2,episode:3};
    const url="https://cdn.example/real.mp4?token=private-secret";
    const now=Date.now();
    expect(writeVerifiedMediaQuality(key,url,1920,1080,storage,now)?.label).toBe("FULL HD");
    expect(readVerifiedMediaQuality(key,storage)?.label).toBe("FULL HD");
    expect(readVerifiedMediaQuality({...key,episode:4},storage)).toBeNull();
    expect(readVerifiedMediaQuality({type:"s",id:"test-series"},storage)?.label).toBe("FULL HD");
    expect(JSON.stringify([...mem.values()])).not.toContain("private-secret");
    expect(sourceFingerprint(url)).not.toBe(url);
    expect(qualityKey({type:"a",id:"anime",season:1,episode:1})).toBe("a:anime:t1:e1");
  });
  test("unknown quality remains unknown if no video has been measured",()=>{
    const routes=["filme.$id.tsx","serie.$id.tsx","anime.$id.tsx"];
    for(const route of routes){
      const src=read("../src/routes/"+route);
      expect(src).toContain("VerifiedQualityBadge");
      expect(src).not.toContain("FULL HD 1080P");
    }
    const player=read("../src/components/player/PlayerControls.tsx");
    expect(player).toContain('"AUTO"');
    expect(player).not.toContain('||\n                "1080p"');
    const card=read("../src/components/catalog/MediaCard.tsx");
    expect(card).not.toContain('const is4k =');
    expect(card).toContain("<VerifiedQualityBadge");
    const hero=read("../src/components/catalog/HeroSection.tsx");
    expect(hero).not.toContain('hero.quality || "FULL HD"');
    expect(hero).toContain("<VerifiedQualityBadge");
    const index=read("../src/routes/index.tsx");
    expect(index).not.toContain('quality: item.streams.some(stream => stream.quality?.includes("4K"))');
  });
});
