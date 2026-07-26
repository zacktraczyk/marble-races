import { describe, expect, test } from "bun:test";

import {
  MAX_FINISH_ROWS,
  createPackedFinishLayout,
  createPackedFinishPlacements,
  finishRackHeightFor,
  roundToFinishGrid,
} from "@game/race/finishGrid";

describe("createPackedFinishLayout", () => {
  test("fits the most columns that span the bay, crunching sub-pitch slack", () => {
    for (const bayCount of [2, 4, 6, 12]) {
      const layout = createPackedFinishLayout({
        width: 1440,
        wallThickness: 15,
        bayCount,
        marblesPerTeam: 60,
      });
      expect(layout.marbleRadius).toBe(4.8);
      expect(layout.shrunk).toBe(false);
      // Columns span at least the bay width; never loose.
      expect(
        layout.columns * 9.6 + (layout.columns - 1) * 0.6
      ).toBeGreaterThanOrEqual(layout.bayInnerWidth - 1e-9);
      expect(layout.columnPitch).toBeLessThanOrEqual(layout.pitch + 1e-9);
      // One fewer column would leave loose slack.
      expect((layout.columns - 1) * 10.2 - 0.6).toBeLessThan(
        layout.bayInnerWidth
      );
    }
  });

  test("derives the rack height from the row count", () => {
    const layout = createPackedFinishLayout({
      width: 1440,
      wallThickness: 15,
      bayCount: 12,
      marblesPerTeam: 99,
    });
    expect(layout.columns).toBe(11);
    expect(layout.rows).toBe(9);
    expect(layout.capacity).toBe(99);
    expect(layout.gridHeight).toBeCloseTo(9 * layout.pitch - 0.6);
    expect(layout.rackHeight).toBeCloseTo(layout.gridHeight + 30);
    expect(
      finishRackHeightFor({
        width: 1440,
        wallThickness: 15,
        bayCount: 12,
        marblesPerTeam: 99,
      })
    ).toBeCloseTo(layout.rackHeight);
  });

  test("gives arbitrary counts a partial top row without changing geometry", () => {
    const layout = createPackedFinishLayout({
      width: 1440,
      wallThickness: 15,
      bayCount: 12,
      marblesPerTeam: 95,
    });
    expect(layout.columns).toBe(11);
    expect(layout.rows).toBe(9);
    expect(layout.capacity).toBe(99);
  });

  test("shrinks the radius when marbles would stack deeper than the row cap", () => {
    const layout = createPackedFinishLayout({
      width: 480,
      wallThickness: 15,
      bayCount: 12,
      marblesPerTeam: 120,
    });
    expect(layout.shrunk).toBe(true);
    expect(layout.marbleRadius).toBeLessThan(4.8);
    expect(layout.marbleRadius).toBeGreaterThanOrEqual(1.2);
    expect(layout.rows).toBeLessThanOrEqual(MAX_FINISH_ROWS);
    expect(layout.capacity).toBeGreaterThanOrEqual(120);
  });

  test("throws when marbles cannot fit even at the minimum radius", () => {
    expect(() =>
      createPackedFinishLayout({
        width: 100,
        wallThickness: 15,
        bayCount: 5,
        marblesPerTeam: 120,
      })
    ).toThrow();
  });
});

describe("roundToFinishGrid", () => {
  test("rounds an ideal count to whole rows of the fitted columns", () => {
    // 6 bays on the default stage fit 22 columns; 60 rounds to 3 rows = 66.
    expect(
      roundToFinishGrid({
        width: 1440,
        wallThickness: 15,
        bayCount: 6,
        idealMarbles: 60,
      })
    ).toBe(66);
    // 2 bays fit 69 columns; 180 rounds to 3 rows = 207.
    expect(
      roundToFinishGrid({
        width: 1440,
        wallThickness: 15,
        bayCount: 2,
        idealMarbles: 180,
      })
    ).toBe(207);
  });

  test("always yields a perfectly fillable grid of at least one row", () => {
    for (const bayCount of [2, 3, 5, 8, 12]) {
      for (const ideal of [6, 25, 60, 100, 333]) {
        const count = roundToFinishGrid({
          width: 1440,
          wallThickness: 15,
          bayCount,
          idealMarbles: ideal,
        });
        const layout = createPackedFinishLayout({
          width: 1440,
          wallThickness: 15,
          bayCount,
          marblesPerTeam: count,
        });
        expect(count % layout.columns).toBe(0);
        expect(layout.capacity).toBe(count);
        expect(layout.rows).toBeLessThanOrEqual(MAX_FINISH_ROWS);
      }
    }
  });
});

describe("createPackedFinishPlacements", () => {
  const options = {
    position: [0, 0],
    width: 200,
    wallThickness: 10,
    bayCount: 3,
    marblesPerTeam: 12,
    marbleRadius: 4,
    gap: 1,
  };

  test("emits slots for every bay", () => {
    const placements = createPackedFinishPlacements(options);
    expect(placements).toHaveLength(36);
    expect(new Set(placements.map(({ bayIndex }) => bayIndex)).size).toBe(3);
  });

  test("fills row-major from the bottom row up, left to right", () => {
    const layout = createPackedFinishLayout(options);
    const bay = createPackedFinishPlacements(options).filter(
      ({ bayIndex }) => bayIndex === 0
    );
    const bottomRow = bay.slice(0, layout.columns);
    // +Y is down, so the bottom row has the largest y.
    const maxY = Math.max(...bay.map(({ position: [, y] }) => y));
    for (const { position } of bottomRow) {
      expect(position[1]).toBeCloseTo(maxY);
    }
    const xs = bottomRow.map(({ position: [x] }) => x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(xs[1] - xs[0]).toBeCloseTo(layout.columnPitch);
    // The next slot after a full row steps one pitch upward (-Y).
    const nextRow = bay[layout.columns];
    expect(nextRow.position[1]).toBeCloseTo(maxY - layout.pitch);
    expect(nextRow.position[0]).toBeCloseTo(xs[0]);
  });

  test("rests the bottom row on the bottom wall, columns touching bay walls", () => {
    const layout = createPackedFinishLayout(options);
    const bay = createPackedFinishPlacements(options).filter(
      ({ bayIndex }) => bayIndex === 0
    );
    const maxY = Math.max(...bay.map(({ position: [, y] }) => y));
    expect(maxY + layout.marbleRadius).toBeCloseTo(
      layout.rackHeight / 2 - options.wallThickness
    );
    const bottomRow = bay.slice(0, layout.columns);
    const minX = Math.min(...bottomRow.map(({ position: [x] }) => x));
    const maxX = Math.max(...bottomRow.map(({ position: [x] }) => x));
    const bayLeft = -options.width / 2 + options.wallThickness;
    expect(minX - layout.marbleRadius).toBeCloseTo(bayLeft);
    expect(maxX + layout.marbleRadius).toBeCloseTo(
      bayLeft + layout.bayInnerWidth
    );
  });
});
