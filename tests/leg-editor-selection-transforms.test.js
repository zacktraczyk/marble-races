import { describe, expect, test } from "bun:test";
import {
  alignLevelObjects,
  distributeLevelObjects,
  getSelectionBounds,
  mirrorLevelObjects,
} from "../src/scenes/leg-builder/editor/legEditor/selection.ts";

const wall = (id, start, end, motion) => ({
  id,
  prefab: "wall",
  properties: {
    start,
    end,
    thickness: 20,
    color: [1, 1, 1, 1],
  },
  ...(motion ? { motion } : {}),
});

describe("leg editor selection transforms", () => {
  test("aligns multiple objects by their visual left edge", () => {
    const first = wall("first", [0, 0], [100, 0]);
    const second = wall("second", [200, 50], [250, 50]);

    expect(alignLevelObjects([first, second], 20, "left")).toBe(true);

    const firstBounds = getSelectionBounds([first], 20);
    const secondBounds = getSelectionBounds([second], 20);
    expect(firstBounds.min[0]).toBeCloseTo(secondBounds.min[0]);
  });

  test("distributes objects with equal visual gaps", () => {
    const first = wall("first", [0, 0], [20, 0]);
    const middle = wall("middle", [40, 0], [60, 0]);
    const last = wall("last", [120, 0], [140, 0]);

    expect(
      distributeLevelObjects([first, middle, last], 20, "horizontal")
    ).toBe(true);

    const firstBounds = getSelectionBounds([first], 20);
    const middleBounds = getSelectionBounds([middle], 20);
    const lastBounds = getSelectionBounds([last], 20);
    expect(middleBounds.min[0] - firstBounds.max[0]).toBeCloseTo(
      lastBounds.min[0] - middleBounds.max[0]
    );
  });

  test("mirrors wall geometry and linear motion", () => {
    const object = wall("slider", [10, 20], [50, 40], {
      type: "oscillate",
      vector: [30, 12],
      periodMs: 1000,
      phase: 0,
      direction: 1,
    });

    expect(mirrorLevelObjects([object], 20, "left-right", [0, 0])).toBe(true);
    expect(object.properties.start[0]).toBeCloseTo(-10);
    expect(object.properties.start[1]).toBeCloseTo(20);
    expect(object.properties.end[0]).toBeCloseTo(-50);
    expect(object.properties.end[1]).toBeCloseTo(40);
    expect(object.motion.vector).toEqual([-30, 12]);
  });

  test("reverses rotational handedness when mirrored", () => {
    const object = wall("spinner", [-50, 0], [50, 0], {
      type: "rotate",
      pivot: "center",
      periodMs: 1000,
      phase: 0,
      direction: 1,
    });

    mirrorLevelObjects([object], 20, "top-bottom", [0, 0]);

    expect(object.motion.direction).toBe(-1);
  });
});
