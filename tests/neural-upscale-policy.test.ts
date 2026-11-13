// tests/neural-upscale-policy.test.ts — trained model and safe 2x inference checks.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { eligibleForNeural2x } from "../src/components/player/useNeuralVideoUpscaler";

describe("neural WebGPU 2x eligibility", () => {
  test("accepts typical low-resolution and 720p movie/anime streams", () => {
    expect(eligibleForNeural2x(640,360)).toBe(true);
    expect(eligibleForNeural2x(1280,720)).toBe(true);
  });
  test("rejects 1080p/4K sources and invalid frames to avoid needless GPU load", () => {
    expect(eligibleForNeural2x(1920,1080)).toBe(false);
    expect(eligibleForNeural2x(3840,2160)).toBe(false);
    expect(eligibleForNeural2x(0,0)).toBe(false);
  });
  test("ships real separately trained weights for real footage and animation", () => {
    for (const content of ["real-life","animation"]) {
      for (const [tier,network] of [["s","anime4k/cnn-2x-s"],["m","anime4k/cnn-2x-m"]]) {
        const model=JSON.parse(readFileSync(
          "public/models/websr/"+content+"-"+tier+".json","utf8"
        )) as {name:string;layers:Record<string,{weights?:number[]}>};
        expect(model.name).toBe(network);
        expect(Object.keys(model.layers).length).toBeGreaterThan(1);
        expect(Object.values(model.layers).some(layer => (layer.weights?.length||0)>10)).toBe(true);
      }
    }
  });
});
