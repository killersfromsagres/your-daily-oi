import {describe,expect,test} from "bun:test";
import {declaredQuality,parseHlsQuality,parseDashQuality,parseMp4Quality,
  safeVodProbeUrl,bestQualityFinding} from "../src/lib/vod-quality-probe";
import {describeMediaQuality,qualityFromDimensions} from "../src/lib/verified-media-quality";
import {validateMediaQualityKey} from "../src/server/vod-quality";
describe("VOD catalog-wide source metadata",()=>{
  test("HLS master reports highest listed variant, not poster dimensions",()=>{
    const master="#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=1280x720\n720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3200000,RESOLUTION=1920x1080\n1080.m3u8\n";
    expect(parseHlsQuality(master)).toMatchObject({label:"FULL HD 1080p",evidence:"manifest",verified:false});
    expect(parseHlsQuality("#EXTM3U\n#EXTINF:4,\nsegment.ts")).toBeNull();
    expect(parseHlsQuality("<html>no</html>")).toBeNull();
  });
  test("DASH MPD exposes encoded variant resolution",()=>{
    expect(parseDashQuality('<MPD><Period><AdaptationSet mimeType="video/mp4"><Representation width="3840" height="2160"/></AdaptationSet></Period></MPD>'))
      .toMatchObject({tier:"4k",evidence:"manifest"});
  });
  test("MP4 tkhd parses 16.16 frame size only from structural box",()=>{
    const bytes=new Uint8Array(160);
    const view=new DataView(bytes.buffer);
    // Full tkhd v0: header at byte 24, box type at +4, width at +84.
    view.setUint32(24,92,false);
    bytes.set([0x74,0x6b,0x68,0x64],28);
    bytes[32]=0;
    view.setUint32(24+84,1920*65536,false);
    view.setUint32(24+88,1080*65536,false);
    expect(parseMp4Quality(bytes)).toMatchObject({label:"FULL HD 1080p",evidence:"container"});
    expect(parseMp4Quality(bytes.subarray(0,50))).toBeNull();
  });
  test("blocked, unrelated or private hosts cannot become a quality probe",()=>{
    expect(safeVodProbeUrl("http://cdn.example/vid.m3u8")).toBeNull();
    expect(safeVodProbeUrl("https://127.0.0.1/a")).toBeNull();
    expect(safeVodProbeUrl("https://192.168.0.4/x")).toBeNull();
    expect(safeVodProbeUrl("https://localhost/video.mp4")).toBeNull();
    expect(safeVodProbeUrl("https://cdn.example.org/movie.m3u8")).not.toBeNull();
  });
  test("declared resolution never pretends to be measured",()=>{
    const source={url:"https://cdn.example.org/test.mp4",name:"1080p",quality:"1080p"};
    expect(declaredQuality(source)).toMatchObject({label:"FULL HD 1080p · informado",verified:false});
    expect(describeMediaQuality([source],null).verified).toBe(false);
    const observed={...qualityFromDimensions(1280,720)!,sourceFingerprint:"foo",observedAt:Date.now()};
    expect(describeMediaQuality([source],observed).label).toBe("HD 720p");
    expect(bestQualityFinding([declaredQuality(source),parseHlsQuality(
      "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\nx.m3u8\n")
    ])?.evidence).toBe("manifest");
  });
  test("media ID and season/episode are strictly validated against catalog",()=>{
    expect(validateMediaQualityKey("f","movie-123",null,null)).toMatchObject({type:"f",id:"movie-123"});
    expect(validateMediaQualityKey("s","one-piece","1","12")).toMatchObject({season:1,episode:12});
    expect(validateMediaQualityKey("s","one-piece","1",null)).toBeNull();
    expect(validateMediaQualityKey("f","https://localhost",null,null)).toBeNull();
  });
});
