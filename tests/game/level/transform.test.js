import { describe, expect, test } from "bun:test";
import { translateSerializedLevel } from "@game/level/transform";

const sampleLevel = () => ({
  version: 3,
  name: "sample",
  size: [100, 200],
  settings: { wallThickness: 2 },
  objects: [
    {
      id: "wall-1",
      prefab: "wall",
      properties: {
        start: [10, 20],
        end: [30, 40],
        color: [1, 0, 0, 1],
      },
    },
    {
      id: "bumper-1",
      prefab: "bumper",
      transform: { position: [5, 6] },
      properties: { radius: 3, color: [0, 1, 0, 1] },
      motion: {
        type: "oscillate",
        periodMs: 1000,
        phase: 0,
        direction: 1,
        vector: [4, 0],
      },
    },
    {
      id: "spawn-1",
      prefab: "spawn-point",
      transform: { position: [50, 60] },
      properties: { radius: 2, color: [0, 0, 1, 1], launchSpeed: 5 },
    },
  ],
});

describe("translate serialized level", () => {
  const offset = [100, -25];

  test("translates wall endpoints", () => {
    const result = translateSerializedLevel(sampleLevel(), offset);

    expect(result.objects[0].properties.start).toEqual([110, -5]);
    expect(result.objects[0].properties.end).toEqual([130, 15]);
  });

  test("translates transform positions of non-wall prefabs", () => {
    const result = translateSerializedLevel(sampleLevel(), offset);

    expect(result.objects[1].transform.position).toEqual([105, -19]);
    expect(result.objects[2].transform.position).toEqual([150, 35]);
  });

  test("leaves relative motion vectors untouched", () => {
    const result = translateSerializedLevel(sampleLevel(), offset);

    expect(result.objects[1].motion.vector).toEqual([4, 0]);
  });

  test("does not mutate the original level (deep clone)", () => {
    const original = sampleLevel();
    const snapshot = structuredClone(original);

    translateSerializedLevel(original, offset);

    expect(original).toEqual(snapshot);
  });

  test("returns a distinct object graph", () => {
    const original = sampleLevel();
    const result = translateSerializedLevel(original, [0, 0]);

    expect(result).not.toBe(original);
    expect(result.objects).not.toBe(original.objects);
    expect(result.objects[0]).not.toBe(original.objects[0]);
  });
});
