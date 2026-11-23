import { describe,expect,test } from "bun:test";
import {readFileSync} from "node:fs";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
describe("native TV live playback recovery",()=>{
  test("player callbacks are stable across status renders",()=>{
    const app=read("../src/routes/tv-live.tsx");
    expect(app).toContain("const onPlaybackStatus=useCallback(");
    expect(app).toContain("const onSourcesExhausted=useCallback(");
    expect(app).toContain("onPlaybackStatus={onPlaybackStatus}");
    expect(app).toContain("onSourcesExhausted={onSourcesExhausted}");
    expect(app).not.toContain("onPlaybackStatus={(id,next)=>");
    expect(app).not.toContain("onSourcesExhausted={()=>");
    expect(app).toContain("reuseUnchangedLiveChannels(");
  });
  test("long startup has a visible retry and alternative channel, not endless loading",()=>{
    const app=read("../src/routes/tv-live.tsx");
    expect(app).toContain("setSlowConnection(true),12000");
    expect(app).toContain('data-tv-focus="player-retry"');
    expect(app).toContain('data-tv-focus="player-next-recovery"');
    expect(app).toContain("onClick={retryChannel}");
    const player=read("../src/components/player/LivePlayer.tsx");
    expect(player).toContain("preferNativeDecoder ? 12000 : 18000");
  });
  test("TV video fallback does not change web HQ or touch desktop catalog",()=>{
    const app=read("../src/routes/tv-live.tsx");
    expect(app).toContain("preferNativeDecoder");
    const player=read("../src/components/player/LivePlayer.tsx");
    expect(player).toContain("if(preferNativeDecoder){setHqEnabled(false);return;}");
    expect(player).toContain("setHqEnabled(automaticHqEnabled(saved))");
    expect(read("../src/routes/__root.tsx")).toContain('["/tv-home", "/tv-live", "/tv-title"]');
  });
});
