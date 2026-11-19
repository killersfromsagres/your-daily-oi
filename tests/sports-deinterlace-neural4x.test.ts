import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {liveHqBackend} from "../src/lib/live-hq-policy";
import {visibleLiveHqStatus} from "../src/lib/automatic-hq";
import {combingConfidence,isSportsLiveChannel,
  LIVE_DEINTERLACE_FRAGMENT} from "../src/components/player/useSportsDeinterlacer";

const desktop={
  width:320,height:180,mobile:false,cores:16,memoryGb:8,
  reducedMotion:false,webgpu:true,sports:true,
};
describe("football motion deinterlace before neural enlargement",()=>{
  test("recognizes sports channels, not entertainment VOD or news",()=>{
    for(const name of ["Premiere 3","SporTV","ESPN","TNT Sports","GE TV","Band Sports"]){
      expect(isSportsLiveChannel(name,"Televisão")).toBe(true);
    }
    expect(isSportsLiveChannel("Telecine Premium","Filmes")).toBe(false);
    expect(isSportsLiveChannel("History","Documentários")).toBe(false);
    expect(isSportsLiveChannel("Canal Exemplo","Esportes")).toBe(true);
  });
  test("only motion+alternating scanline mismatch produces strong comb correction",()=>{
    const combing=combingConfidence({
      center:.9,above:.1,below:.1,previous:.1,
    });
    expect(combing).toBeGreaterThan(.85);
    expect(combingConfidence({
      center:.9,above:.1,below:.1,previous:.9,
    })).toBe(0);
    expect(combingConfidence({
      center:.5,above:.4,below:.6,previous:.1,
    })).toBe(0);
    expect(combingConfidence({
      center:.2,above:.2,below:.2,previous:.2,
    })).toBe(0);
  });
  test("GPU shader uses previous frame and aligned diagonals, preserving progressive frames",()=>{
    expect(LIVE_DEINTERLACE_FRAGMENT).toContain("uniform sampler2D u_previous");
    expect(LIVE_DEINTERLACE_FRAGMENT).toContain("u_previousValid");
    expect(LIVE_DEINTERLACE_FRAGMENT).toContain("float moved");
    expect(LIVE_DEINTERLACE_FRAGMENT).toContain("float zigzag");
    expect(LIVE_DEINTERLACE_FRAGMENT).toContain("diagA");
    expect(LIVE_DEINTERLACE_FRAGMENT).toContain("oddLine");
    expect(LIVE_DEINTERLACE_FRAGMENT).toContain("mix(center,estimate,confidence*oddLine");
    const code=readFileSync("src/components/player/useSportsDeinterlacer.ts","utf8");
    expect(code).toContain("video.requestVideoFrameCallback");
    expect(code).toContain("video.getVideoPlaybackQuality");
    expect(code).toContain("gl.texImage2D");
    expect(code).toContain("width>1920||height>1080");
    expect(code).toContain("(mobile&&(width>1280||height>720))");
    expect(code).toContain("lastTotal>0");
    expect(code).toContain('disable("GPU deinterlace too slow")');
  });
});
describe("true 4x cascaded neural resolution and safe FPS downgrade",()=>{
  test("4x is gated on powerful desktops and small sports video only",()=>{
    expect(liveHqBackend(desktop)).toBe("neural-4x");
    expect(liveHqBackend({...desktop,width:480,height:270})).toBe("neural-4x");
    expect(liveHqBackend({...desktop,width:640,height:360})).toBe("neural");
    expect(liveHqBackend({...desktop,cores:8})).toBe("neural");
    expect(liveHqBackend({...desktop,mobile:true})).toBe("neural");
    expect(liveHqBackend({...desktop,webgpu:false})).toBe("spatial");
    expect(liveHqBackend({...desktop,cores:2,memoryGb:2})).toBe("native");
    expect(liveHqBackend({...desktop,sports:false})).toBe("neural");
    expect(liveHqBackend({...desktop,width:1920,height:1080})).toBe("native");
  });
  test("never falsely calls spatial/deinterlace AI 4x",()=>{
    expect(visibleLiveHqStatus({
      enabled:true,neural4xActive:true,neuralActive:false,spatialActive:false,
    })).toBe("ai-4x");
    expect(visibleLiveHqStatus({
      enabled:true,neural4xActive:false,neuralActive:true,spatialActive:false,
    })).toBe("ai-2x");
    expect(visibleLiveHqStatus({
      enabled:true,neural4xActive:false,neuralActive:false,spatialActive:true,
    })).toBe("spatial");
    expect(visibleLiveHqStatus({
      enabled:true,neuralActive:false,spatialActive:false,deinterlaceActive:true,
    })).toBe("deinterlace");
    expect(visibleLiveHqStatus({
      enabled:true,neural4xActive:true,neuralActive:true,spatialActive:true,
      deinterlaceActive:true,
    })).toBe("ai-4x");
    expect(visibleLiveHqStatus({
      enabled:false,neural4xActive:true,neuralActive:true,spatialActive:true,
    })).toBe("off");
  });
  test("actual 4x output uses TWO trained 2x CNN renders with proper frame source",()=>{
    const neural=readFileSync("src/components/player/useNeuralVideoUpscaler.ts","utf8");
    const vendor=readFileSync("public/vendor/websr/websr.js","utf8");
    expect(neural).toContain("const intermediate=scale===4");
    expect(neural).toContain("await withinBudget(engine.render(input)");
    expect(neural).toContain("await withinBudget(secondPass.render(intermediate)");
    expect(neural).toContain("canvas:intermediate||canvas");
    expect(neural).toContain("secondPass=new WebSR");
    expect(neural).toContain("preprocess?.active?preprocess.canvasRef.current");
    expect(neural).toContain("secondPass.destroy()");
    expect(vendor).toContain("source instanceof HTMLCanvasElement");
    expect(vendor).toContain("bitmap.close()");
  });
  test("live chain prefers proper deinterlace -> 4x -> 2x -> spatial -> native",()=>{
    const live=readFileSync("src/components/player/LivePlayer.tsx","utf8");
    const spatial=readFileSync("src/components/player/useVideoEnhancer.ts","utf8");
    expect(live).toContain("useSportsDeinterlacer(");
    expect(live).toContain("const processedInput=");
    expect(live).toContain("neural4xCanvasRef");
    expect(live).toContain('neural4x.status==="unavailable"');
    expect(live).toContain('neural.status==="unavailable"');
    expect(live).toContain('hqStatus==="deinterlace"');
    expect(live).toContain('data-sports-deinterlace={deinterlacer.active');
    expect(live).toContain("hqEnabled&&sportsChannel");
    expect(spatial).toContain("preprocess?.active?preprocess.canvasRef.current");
    expect(live).not.toContain("setPlayNonce(value => value + 1);\n  }, [hqEnabled]");
  });
});
