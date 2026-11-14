// tests/hq-render-policy.test.ts — HQ must not contend with Android video decoder.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { chooseHqProcessing } from "../src/lib/hq-render-policy";

const device={width:854,height:480,mobile:false,logicalCores:8,memoryGb:8,webgpu:true};
describe("ZANG FLIX HQ adaptive performance",()=>{
  test("allows opt-in compact SD inference on capable mobile devices",()=>{
    expect(chooseHqProcessing({...device,mobile:true})).toBe("neural");
    expect(chooseHqProcessing({...device,mobile:true,width:1280,height:720})).toBe("native");
    expect(chooseHqProcessing({...device,mobile:true,logicalCores:4})).toBe("native");
  });
  test("uses the lightweight single-pass shader for desktop SD and 720p",()=>{
    expect(chooseHqProcessing({...device,webgpu:false})).toBe("webgl");
    expect(chooseHqProcessing({...device,width:1280,height:720})).toBe("neural");
  });
  test("reserves expensive neural processing for powerful desktop, low resolution",()=>{
    expect(chooseHqProcessing({...device,width:640,height:360,logicalCores:12})).toBe("neural");
    expect(chooseHqProcessing({...device,width:640,height:360,logicalCores:12,webgpu:false})).toBe("webgl");
  });
  test("native compositor protects HD sources and low-memory GPUs",()=>{
    expect(chooseHqProcessing({...device,width:1920,height:1080})).toBe("native");
    expect(chooseHqProcessing({...device,logicalCores:2})).toBe("native");
    expect(chooseHqProcessing({...device,width:0,height:0})).toBe("native");
  });
  test("HQ button no longer displays the AI sparkle icon",()=>{
    const controls=readFileSync("src/components/player/PlayerControls.tsx","utf8");
    expect(controls).toContain("zf-hq-symbol");
    expect(controls).toContain("<span>HQ</span>");
    expect(controls).not.toContain("<Sparkles ");
  });
  test("WebGL is single-pass and bounded instead of two full-resolution GPU passes",()=>{
    const shader=readFileSync("src/components/player/useVideoEnhancer.ts","utf8");
    expect(shader).toContain("requestVideoFrameCallback");
    expect(shader).not.toContain("fboPass1");
    expect(shader).toContain("getVideoPlaybackQuality");
  });
});
