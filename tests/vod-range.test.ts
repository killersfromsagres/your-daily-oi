import { describe, expect, test, afterEach } from "bun:test";
import { boundedVodRange, isBoundedVodReply, VOD_RANGE_CHUNK_BYTES } from "../src/lib/vod-range";
import { handleSaimoVodProxy } from "../src/lib/saimo-vod-proxy";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("finite VOD byte ranges", () => {
  test("limits open-ended Range and initial request to 4 MiB", () => {
    expect(boundedVodRange(null)).toBe("bytes=0-4194303");
    expect(boundedVodRange("bytes=0-")).toBe("bytes=0-4194303");
    expect(boundedVodRange("bytes=8192-")).toBe("bytes=8192-4202495");
    expect(boundedVodRange("bytes=50-100")).toBe("bytes=50-100");
    expect(boundedVodRange("bytes=0-999999999")).toBe("bytes=0-4194303");
    expect(boundedVodRange(null, true)).toBe("bytes=0-1");
  });

  test("rejects invalid, ambiguous and unsafe ranges", () => {
    expect(boundedVodRange("bytes=-200")).toBeNull();
    expect(boundedVodRange("bytes=0-10,20-30")).toBeNull();
    expect(boundedVodRange("bytes=10-5")).toBeNull();
    expect(boundedVodRange("bytes=99999999999999999-")).toBeNull();
  });

  test("does not accept oversized or malformed upstream 206", () => {
    const ok = new Response("x", { status:206, headers: { "Content-Range": "bytes 0-0/8000000" } });
    const huge = new Response("x", { status:206, headers: { "Content-Range": `bytes 0-${VOD_RANGE_CHUNK_BYTES}/8000000` } });
    expect(isBoundedVodReply(ok)).toBe(true);
    expect(isBoundedVodReply(huge)).toBe(false);
  });

  test("returns real HTTP 206 chunks for the browser to fetch sequentially", async () => {
    const received: string[] = [];
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      received.push(new Headers(init?.headers).get("range") || "");
      return new Response("A", { status:206, headers:{
        "content-type":"video/mp4",
        "content-range":"bytes 4194304-4194304/10000000",
        "content-length":"1",
      } });
    }) as typeof fetch;
    const response = await handleSaimoVodProxy(new Request("https://zangflix.example/api/saimo-vod?tipo=movie&id=550",{
      headers: { Range:"bytes=4194304-" },
    }));
    expect(response.status).toBe(206);
    expect(received).toEqual(["bytes=4194304-8388607"]);
    expect(response.headers.get("content-range")).toBe("bytes 4194304-4194304/10000000");
  });

  test("avoids serving an unbounded 200 full-length MP4", async () => {
    globalThis.fetch = (async () => new Response("media",{
      headers:{"content-type":"video/mp4","content-length":"90000000"},
    })) as typeof fetch;
    const response = await handleSaimoVodProxy(new Request("https://zangflix.example/api/saimo-vod?tipo=movie&id=550"));
    expect(response.status).toBe(502);
  });
});
