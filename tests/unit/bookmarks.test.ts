import { describe, expect, it } from "vitest";
import { formatBookmarks, parseBookmarks, toggleBookmark } from "../../src/lib/pdf/bookmarks";

describe("marcadores", () => {
  it("lê em ordem, sem repetir e sem lixo", () => {
    expect(parseBookmarks("45,12,45,x,0,80")).toEqual([12, 45, 80]);
    expect(parseBookmarks("")).toEqual([]);
    expect(parseBookmarks(undefined)).toEqual([]);
  });
  it("marca e desmarca mantendo a forma canônica", () => {
    expect(toggleBookmark("", 12)).toBe("12");
    expect(toggleBookmark("12,80", 45)).toBe("12,45,80");
    expect(toggleBookmark("12,45,80", 45)).toBe("12,80");
    expect(toggleBookmark("12", 12)).toBe("");
    expect(formatBookmarks([3, 1, 3])).toBe("1,3");
  });
});
