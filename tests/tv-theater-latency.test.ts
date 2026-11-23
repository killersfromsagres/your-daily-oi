import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {adjustTvQuality,tvCatchupAction,tvBufferedSeconds,tvSeekableEnd} from "../src/lib/tv-playback-optimizer";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
describe("TCL cinema fullscreen never changes the web layout",()=>{
  test("dedicated TV route has remote fullscreen entry and exit",()=>{
    const live=read("../src/routes/tv-live.tsx");
    const css=read("../src/styles/tv-cinema.css");
    expect(live).toContain('data-tv-focus="player-fullscreen"');
    expect(live).toContain('data-tv-focus="player-fullscreen-exit"');
    expect(live).toContain("if(cinema){");
    expect(live).toContain("setCinema(false)");
    expect(live).toContain('cinema?" is-tv-cinema"');
    expect(css).toContain(".zf-tv-player-frame.is-tv-fullscreen");
    expect(css).toContain("height:100dvh!important");
    expect(css).toContain(".zf-tenfoot-live.is-tv-cinema");
    expect(read("../src/routes/__root.tsx")).not.toContain('href: tvCinemaCss');
  });
  test("custom anime icon has no AI/sparkle symbol and is TV-only",()=>{
    const home=read("../src/routes/tv-home.tsx");
    expect(home).toContain("<TvAnimeFrameIcon size={22}/>");
    expect(home).not.toContain("<Sparkles");
    expect(read("../src/components/icons/TvAnimeFrameIcon.tsx")).toContain("<svg");
  });
  test("versioning is TV-only and mobile version remains unchanged",()=>{
    const gradle=read("../android/app/build.gradle.kts");
    expect(gradle).toContain('versionCode = 6');
    expect(gradle).toContain('versionCode = 11');
    expect(gradle).toContain('versionName = "2.6.0"');
    expect(read("../src/lib/tv-build.ts")).toContain('"2.6.0"');
  });
});
describe("CPU-safe adaptive TV playback and latency",()=>{
  test("protects low-end decoders then slowly restores sharpness",()=>{
    expect(adjustTvQuality({droppedDelta:20,decodedDelta:100,bufferAhead:2,
      currentLevel:4,previousCap:-1,stableWindows:0,maximumLevel:5}))
      .toMatchObject({cap:3,reason:"protect"});
    expect(adjustTvQuality({droppedDelta:0,decodedDelta:180,bufferAhead:4,
      currentLevel:3,previousCap:3,stableWindows:3,maximumLevel:5}).cap).toBe(3);
    expect(adjustTvQuality({droppedDelta:0,decodedDelta:180,bufferAhead:4,
      currentLevel:3,previousCap:3,stableWindows:4,maximumLevel:5}))
      .toMatchObject({cap:4,reason:"recover"});
    expect(adjustTvQuality({droppedDelta:0,decodedDelta:180,bufferAhead:4,
      currentLevel:5,previousCap:5,stableWindows:4,maximumLevel:5}).cap).toBe(-1);
  });
  test("does not accelerate or seek when buffering or dropping frames",()=>{
    const sample={seekableEnd:320,currentTime:288,bufferAhead:5,paused:false,
      stalled:false,decoderStruggling:false,hlsManaged:false};
    expect(tvCatchupAction({...sample,decoderStruggling:true}).action).toBe("none");
    expect(tvCatchupAction({...sample,bufferAhead:1}).action).toBe("none");
    expect(tvCatchupAction(sample).action).toBe("seek");
    expect(tvCatchupAction({...sample,currentTime:316}).action).toBe("speed");
  });
  test("never draws expensive canvas to fake AI 4K quality",()=>{
    const player=read("../src/components/player/TvStreamPlayer.tsx");
    expect(player).toContain("adjustTvQuality(");
    expect(player).toContain("tvCatchupAction(");
    expect(player).toContain("capLevelOnFPSDrop:true");
    expect(player).not.toContain("getContext(");
    expect(player).not.toContain("useNeuralVideoUpscaler");
    expect(player).not.toContain("DLSS 5");
  });
  test("handles empty and finite ranges safely",()=>{
    const range=(a:number,b:number)=>({length:1,start:()=>a,end:()=>b});
    expect(tvBufferedSeconds({buffered:range(10,16) as TimeRanges,currentTime:12})).toBe(4);
    expect(tvBufferedSeconds({buffered:range(10,16) as TimeRanges,currentTime:32})).toBe(0);
    expect(tvSeekableEnd({seekable:range(100,450) as TimeRanges})).toBe(450);
    expect(tvSeekableEnd({seekable:{length:0} as TimeRanges})).toBeNull();
  });
});
