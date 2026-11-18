import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {detectDeviceProfile} from "../src/lib/device-profile";

const legacy=readFileSync("src/styles/tv-experience.css","utf8");
const premium=readFileSync("src/styles/football-tv-remote.css","utf8");
const shelf=readFileSync("src/components/tv/JogosShelf.tsx","utf8");
const card=readFileSync("src/styles/match-glass-premium.css","utf8");

describe("ZANG FLIX TV sports board — source of truth",()=>{
  test("removes obsolete horizontal micro-ticket cascade that caused screenshot regressions",()=>{
    expect(legacy).not.toContain("grid-auto-flow:column");
    expect(legacy).not.toContain("grid-template-areas:'mast mast' 'teams time'");
    expect(legacy).not.toContain("grid-auto-columns:minmax(250px,290px)");
    expect(legacy).not.toContain(".zgame-center.is-compact .zf-ticket-main");
    expect(legacy).not.toContain(".zgame-center.is-compact .zf-ticket-teams");
    expect(legacy).not.toContain(".zgame-center.is-compact .zf-ticket-watch");
    expect(legacy).not.toContain(".zgame-center.is-compact .zf-ticket-date{display:none}");
    expect(legacy).not.toContain(".zgame-center.is-compact .zf-ticket-match-meta{display:none}");
  });
  test("uses actual platform detection, never classifies desktop monitors as Smart TVs",()=>{
    expect(detectDeviceProfile({userAgent:"Mozilla/5.0 Chrome",viewportWidth:1920,coarsePointer:false,touchPoints:0})).toBe("web");
    expect(detectDeviceProfile({userAgent:"Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0)",viewportWidth:960,coarsePointer:false,touchPoints:0})).toBe("tv");
    expect(detectDeviceProfile({userAgent:"Android ZangFlixTV/1.2",viewportWidth:720,coarsePointer:false,touchPoints:0})).toBe("tv");
    expect(detectDeviceProfile({userAgent:"Chrome",tvMode:true,viewportWidth:1280,coarsePointer:false,touchPoints:0})).toBe("tv");
  });
  test("TV layout uses rows with four, three, two, one readable columns",()=>{
    expect(premium).toContain('html[data-zf-platform="tv"] .zf-reference-section .zgame-grid');
    expect(premium).toContain("grid-auto-flow:row");
    expect(premium).toContain("grid-auto-columns:auto");
    expect(premium).toContain("grid-template-columns:repeat(4,minmax(0,1fr))");
    expect(premium).toContain("grid-template-columns:repeat(3,minmax(0,1fr))");
    expect(premium).toContain("grid-template-columns:repeat(2,minmax(0,1fr))");
    expect(premium).toContain("grid-template-columns:minmax(0,1fr)");
    expect(premium).toContain("overflow:visible");
    expect(premium).toContain("scroll-snap-type:none");
  });
  test("retains actual kickoff, status, venue and channel playback in original component",()=>{
    expect(shelf).toContain('import "@/styles/football-tv-remote.css"');
    expect(shelf).toContain("getMatchCardVisual(game, now)");
    expect(shelf).toContain('"zf-ticket-score-panel"');
    expect(shelf).toContain('"zf-ticket-stadium"');
    expect(shelf).toContain("onWatch(game.canalId!)");
    expect(shelf).toContain("<MatchLineups game={game}/>");
    expect(shelf).toContain("AlertTriangle size={18}");
  });
  test("TV controls have visible sizes, safe contrast and accessible remote focus",()=>{
    expect(premium).toContain(".zf-ticket-premium .zf-ticket-date");
    expect(premium).toContain("width:58px;height:64px");
    expect(premium).toContain("min-height:65px");
    expect(premium).toContain("min-height:44px");
    expect(premium).toContain("min-height:56px");
    expect(premium).toContain("outline:3px solid #8affc2 !important");
    expect(premium).toContain("-webkit-backdrop-filter:blur(15px)");
    expect(premium).toContain("backdrop-filter:blur(15px)");
    expect(premium).toContain("@media(prefers-reduced-motion:reduce)");
    expect(card).toContain("zf-ticket-live-dot");
    expect(card).toContain(".zf-ticket-watch.is-ready");
  });
});
