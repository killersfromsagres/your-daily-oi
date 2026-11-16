import {describe,expect,test} from "bun:test";
import {horrorSpotlightWindow,horrorSpotlightNext,horrorSpotlightPages,HORROR_SPOTLIGHT_PAGE_SIZE} from "../src/lib/horror-spotlight";
import {readFileSync} from "node:fs";

describe("Mais terror na sua noite — carrossel",()=>{
  test("displays the selected movie and four neighbours without inventing or duplicating films",()=>{
    const movies=Array.from({length:14},(_,id)=>({id:"catalog-"+id}));
    const window=horrorSpotlightWindow(movies,0);
    expect(window.map(entry=>entry.index)).toEqual([12,13,0,1,2]);
    expect(window.find(entry=>entry.offset===0)?.item).toBe(movies[0]);
    expect(new Set(window.map(entry=>entry.item.id)).size).toBe(5);
  });
  test("supports one to four catalog items without duplicates",()=>{
    for(let total=1;total<=4;total++){
      const list=Array.from({length:total},(_,id)=>({id}));
      const window=horrorSpotlightWindow(list,0);
      expect(window).toHaveLength(total);
      expect(new Set(window.map(item=>item.index)).size).toBe(total);
    }
  });
  test("loops navigation and groups all 14 existing films into four page dots",()=>{
    expect(horrorSpotlightNext(0,-1,14)).toBe(13);
    expect(horrorSpotlightNext(13,1,14)).toBe(0);
    expect(horrorSpotlightPages(14)).toBe(4);
    expect(HORROR_SPOTLIGHT_PAGE_SIZE).toBe(4);
    expect(horrorSpotlightWindow([],0)).toEqual([]);
  });
  test("retains film catalog links and saved-list actions, not fabricated stream URLs",()=>{
    const code=readFileSync(new URL("../src/components/catalog/ZangsPicks.tsx",import.meta.url),"utf8");
    expect(code).toContain('const detailPath = "/filme/" + selected.id');
    expect(code).toContain("onToggleSaved(selected.id)");
    expect(code).toContain("item.posterUrl");
    expect(code).toContain("/images/horror-night.webp");
    expect(code).toContain("onTouchEnd");
    expect(code).toContain('aria-pressed={active}');
    expect(code).not.toContain("MediaCarousel");
  });
});
