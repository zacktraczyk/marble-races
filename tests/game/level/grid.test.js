import { describe, expect, test } from "bun:test";
import {
  createGridLayout,
  snapDeltaToGrid,
  snapPointToGrid,
} from "@game/level/grid";

const bounds = { min: [-705, -390], max: [705, 270] };

describe("level builder grid layout", () => {
  test("fits complete five-cell groups exactly between every boundary", () => {
    const layout = createGridLayout(bounds);

    expect(layout.columns).toBe(95);
    expect(layout.rows).toBe(45);
    expect(layout.columns % 5).toBe(0);
    expect(layout.rows % 5).toBe(0);
    expect(bounds.min[0] + layout.step[0] * layout.columns).toBeCloseTo(
      bounds.max[0]
    );
    expect(bounds.min[1] + layout.step[1] * layout.rows).toBeCloseTo(
      bounds.max[1]
    );
    expect(layout.majorStep[0]).toBeCloseTo(layout.step[0] * 5);
    expect(layout.majorStep[1]).toBeCloseTo(layout.step[1] * 5);
  });

  test("snaps points to the exact positions represented by the dot grid", () => {
    const layout = createGridLayout(bounds);
    const point = snapPointToGrid(
      [
        bounds.min[0] + layout.step[0] * 3.4,
        bounds.min[1] + layout.step[1] * 7.6,
      ],
      layout
    );
    const delta = snapDeltaToGrid(
      [layout.step[0] * 1.6, layout.step[1] * -2.4],
      layout
    );

    expect(point[0]).toBeCloseTo(bounds.min[0] + layout.step[0] * 3);
    expect(point[1]).toBeCloseTo(bounds.min[1] + layout.step[1] * 8);
    expect(delta[0]).toBeCloseTo(layout.step[0] * 2);
    expect(delta[1]).toBeCloseTo(layout.step[1] * -2);
    expect(snapPointToGrid(bounds.min, layout)).toEqual(bounds.min);
    expect(snapPointToGrid(bounds.max, layout)).toEqual(bounds.max);
  });
});
