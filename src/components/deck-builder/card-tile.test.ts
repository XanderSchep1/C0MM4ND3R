import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TILE_GRID_CLASS } from "./card-tile";

// These can't render a browser, so they guard the two things that made search results
// collapse in Safari: a height-capped grid whose rows may shrink, and a tile that clips
// its own box (which lets its minimum height drop to zero).
describe("card tile grid", () => {
  it("keeps every row as tall as its tile even when the grid is height-capped", () => {
    expect(TILE_GRID_CLASS).toContain("max-h-");
    expect(TILE_GRID_CLASS).toContain("auto-rows-max");
  });

  it("is the only height-capped grid in the components", () => {
    const dir = import.meta.dirname;
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx") && f !== "card-tile.tsx")
      .filter((f) => /grid[^"`]*max-h-\[|max-h-\[[^"`]*grid/.test(readFileSync(path.join(dir, f), "utf8")));
    expect(offenders, "use TILE_GRID_CLASS for scrolling tile grids").toEqual([]);
  });

  it("does not clip the whole tile, only the image corners", () => {
    const source = readFileSync(path.join(import.meta.dirname, "card-tile.tsx"), "utf8");
    const root = source.match(/className=\{`flex flex-col([^`]*)`/)?.[1] ?? "";
    expect(root).not.toContain("overflow-hidden");
    expect(source).toMatch(/aspect-\[5\/7\][^"]*overflow-hidden/);
  });
});
