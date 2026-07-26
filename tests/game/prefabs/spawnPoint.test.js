import { describe, expect, test } from "bun:test";
import { spawnPointDefinition } from "@game/prefabs/spawnPoint";
import {
  DEFAULT_SPAWN_DIRECTION_VARIANCE,
  randomSpawnAngle,
  randomSpawnOffsetsInCircle,
  spawnAreaRadius,
} from "@game/race/spawn";

const seededRandom = (initialSeed) => {
  let seed = initialSeed;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
};

describe("spawn point", () => {
  test("randomizes launches across the full configured direction range", () => {
    const center = Math.PI / 2;
    const variance = DEFAULT_SPAWN_DIRECTION_VARIANCE;

    expect(variance).toBeCloseTo(Math.PI / 6);
    expect(randomSpawnAngle(center, variance, () => 0)).toBeCloseTo(
      center - variance
    );
    expect(randomSpawnAngle(center, variance, () => 0.5)).toBeCloseTo(center);
    expect(randomSpawnAngle(center, variance, () => 1)).toBeCloseTo(
      center + variance
    );
  });

  test("renders two rays at the lower and upper direction bounds", () => {
    const definition = spawnPointDefinition({
      position: [0, 0],
      radius: 20,
      directionVariance: DEFAULT_SPAWN_DIRECTION_VARIANCE,
    });
    const parts = definition.render?.parts ?? [];
    const lowerBound = parts.at(-2);
    const upperBound = parts.at(-1);

    expect(parts).toHaveLength(4);
    expect(lowerBound?.localTransform?.rotation).toBeCloseTo(
      -DEFAULT_SPAWN_DIRECTION_VARIANCE
    );
    expect(upperBound?.localTransform?.rotation).toBeCloseTo(
      DEFAULT_SPAWN_DIRECTION_VARIANCE
    );
    expect(lowerBound?.localTransform?.scale?.[0]).toBe(18);
    expect(upperBound?.localTransform?.scale?.[0]).toBe(18);
  });

  test("grows a simple circular indicator to fit the current team wave", () => {
    const definition = spawnPointDefinition({
      position: [0, 0],
      radius: 12,
      marbleCount: 4,
      marbleRadius: 4,
    });
    const parts = definition.render?.parts ?? [];

    expect(parts).toHaveLength(4);
    expect(parts[0].primitive.type).toBe("circle");
    expect(parts[0].localTransform?.scale).toEqual([16, 16]);
  });

  test("randomizes each wave across different points inside the circle", () => {
    const marbleRadius = 4.8;
    const areaRadius = spawnAreaRadius(12, 12, marbleRadius);
    const first = randomSpawnOffsetsInCircle(
      12,
      areaRadius,
      marbleRadius,
      seededRandom(42)
    );
    const second = randomSpawnOffsetsInCircle(
      12,
      areaRadius,
      marbleRadius,
      seededRandom(99)
    );

    expect(first).toHaveLength(12);
    expect(first).not.toEqual(second);
    expect(new Set(first.map((position) => position.join(","))).size).toBe(12);
    expect(
      first.every(
        ([x, y]) => Math.hypot(x, y) + marbleRadius <= areaRadius + 1e-9
      )
    ).toBe(true);
  });
});
