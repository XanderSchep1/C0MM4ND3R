import { describe, expect, it } from "vitest";
import { CARDS_PER_PAGE, clampPage, pageCount, pageRange, pageSlice } from "./book";

const items = Array.from({ length: 40 }, (_, i) => i + 1);

describe("book paging", () => {
  it("counts pages, always at least one", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(1)).toBe(1);
    expect(pageCount(CARDS_PER_PAGE)).toBe(1);
    expect(pageCount(CARDS_PER_PAGE + 1)).toBe(2);
    expect(pageCount(40)).toBe(7);
  });

  it("slices a page and handles the short last page", () => {
    expect(pageSlice(items, 0)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pageSlice(items, 1)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(pageSlice(items, 6)).toEqual([37, 38, 39, 40]);
    expect(pageSlice([], 0)).toEqual([]);
  });

  it("clamps a page number that is out of range, as when the list shrinks", () => {
    expect(clampPage(99, 40)).toBe(6);
    expect(clampPage(-3, 40)).toBe(0);
    expect(clampPage(6, 37)).toBe(6);
    expect(clampPage(6, 36)).toBe(5); // adding the last card on page 7 removes that page
    expect(clampPage(NaN, 40)).toBe(0);
    expect(pageSlice(items, 99)).toEqual([37, 38, 39, 40]);
  });

  it("describes the range of cards on a page for the footer", () => {
    expect(pageRange(0, 40)).toEqual({ from: 1, to: 6 });
    expect(pageRange(1, 40)).toEqual({ from: 7, to: 12 });
    expect(pageRange(6, 40)).toEqual({ from: 37, to: 40 });
    expect(pageRange(0, 0)).toEqual({ from: 0, to: 0 });
  });
});
