import { describe, expect, test } from "bun:test";
import { tvNextPosition } from "../src/lib/tv-focus";
describe("TV remote navigation: stable row/column",()=>{
  test("horizontal focus remains in its current rail",()=>{
    expect(tvNextPosition({row:2,column:0},[5,3,7],"ArrowLeft")).toEqual({row:2,column:0});
    expect(tvNextPosition({row:2,column:3},[5,3,7],"ArrowRight")).toEqual({row:2,column:4});
  });
  test("moving between rows preserves the column when possible",()=>{
    expect(tvNextPosition({row:0,column:5},[7,3,6],"ArrowDown")).toEqual({row:1,column:2});
    expect(tvNextPosition({row:2,column:4},[7,3,6],"ArrowUp")).toEqual({row:1,column:2});
  });
  test("never goes out of bounds",()=>{
    expect(tvNextPosition({row:0,column:0},[1],"ArrowUp")).toEqual({row:0,column:0});
    expect(tvNextPosition({row:0,column:0},[1],"ArrowDown")).toEqual({row:0,column:0});
  });
});
