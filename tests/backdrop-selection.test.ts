import { describe,expect,test } from "bun:test";
import { selectBestBackdrop,type BackdropArtwork } from "../src/lib/backdrop-selection";
const art=(file_path:string,width:number,height:number,iso_639_1:string|null=null):BackdropArtwork=>({file_path,width,height,iso_639_1});
describe("native high-resolution hero artwork",()=>{
  test("selects verified UHD rather than a popular low-resolution default",()=>{
    const small={...art("/small.jpg",1280,720),vote_count:500};
    const uhd=art("/uhd.jpg",3840,2160);
    expect(selectBestBackdrop([small,uhd])).toBe(uhd);
  });
  test("prefers text-free art within the same resolution tier",()=>{
    const text={...art("/text.jpg",3840,2160,"en"),vote_count:100};
    const clean=art("/clean.jpg",3840,2160);
    expect(selectBestBackdrop([text,clean])).toBe(clean);
  });
  test("rejects portrait posters and invalid dimensions without fabricating 4K",()=>{
    expect(selectBestBackdrop([art("/poster.jpg",4000,6000),art("/invalid.jpg",NaN,2160)])).toBeNull();
    const hd=art("/hd.jpg",1920,1080);const source=[hd];
    expect(selectBestBackdrop(source)).toBe(hd);
    expect(hd.width).toBe(1920);
    expect(source).toEqual([hd]);
  });
});
