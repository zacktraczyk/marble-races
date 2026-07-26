import { describe, expect, test } from "bun:test";
import {
  computeLegCullBounds,
  LEG_BOTTOM_CULL_MARGIN,
  LEG_CULL_PADDING,
} from "@scenes/race-player/legInstance";
import { AuthoredLevel } from "@game/level/authoredLevel";
import { translateSerializedLevel } from "@game/level/transform";
import { topSliderSpawnClearance } from "@game/prefabs/spawnPoint";
import { MAX_MARBLE_RADIUS } from "@game/level/constants";

const frame = (overrides = {}) => ({
  index: 0,
  size: [40, 60],
  center: [0, 0],
  top: -30,
  bottom: 30,
  ...overrides,
});

describe("computeLegCullBounds", () => {
  test("pads the sides and top generously", () => {
    const bounds = computeLegCullBounds(frame());

    expect(bounds.minX).toBe(-20 - LEG_CULL_PADDING);
    expect(bounds.maxX).toBe(20 + LEG_CULL_PADDING);
    expect(bounds.minY).toBe(-30 - LEG_CULL_PADDING);
  });

  test("keeps the bottom tight so escapees never enter the leg below", () => {
    const bounds = computeLegCullBounds(frame());

    expect(bounds.maxY).toBe(30 + LEG_BOTTOM_CULL_MARGIN);
    expect(LEG_BOTTOM_CULL_MARGIN).toBeLessThan(LEG_CULL_PADDING);
  });

  test("tracks an off-origin leg's frame", () => {
    const bounds = computeLegCullBounds(
      frame({ index: 1, center: [0, 90], top: 60, bottom: 120 })
    );

    expect(bounds.minY).toBe(60 - LEG_CULL_PADDING);
    expect(bounds.maxY).toBe(120 + LEG_BOTTOM_CULL_MARGIN);
    expect(bounds.minX).toBe(-20 - LEG_CULL_PADDING);
    expect(bounds.maxX).toBe(20 + LEG_CULL_PADDING);
  });
});

describe("translated leg spawn layout", () => {
  test("keeps a top-slider spawn inside its translated playback leg", () => {
    const stage = {
      width: 100,
      height: 300,
      spawn: () => ({ scale: [1, 1], delete: () => {} }),
      world: { flushDestruction: () => {} },
    };
    const level = new AuthoredLevel(
      stage,
      { teamCount: 2, marblesPerTeam: 1 },
      5
    );
    const serialized = {
      version: 3,
      name: "slider",
      size: [100, 100],
      settings: { wallThickness: 5 },
      objects: [
        {
          id: "spawn",
          prefab: "spawn-point",
          transform: { position: [0, -20], rotation: Math.PI / 2 },
          properties: {
            radius: 10,
            color: [0, 1, 1, 1],
            launchSpeed: 0,
            variant: "top-slider",
          },
          motion: {
            type: "oscillate",
            vector: [20, 0],
            periodMs: 1000,
            phase: 0.75,
            direction: 1,
          },
        },
      ],
    };
    const playbackOrigin = [0, 150];

    level.restore(
      translateSerializedLevel(serialized, playbackOrigin),
      playbackOrigin
    );

    expect(level.find("spawn-point").transform.position).toEqual([
      0,
      playbackOrigin[1] -
        serialized.size[1] / 2 +
        serialized.settings.wallThickness +
        topSliderSpawnClearance(10, MAX_MARBLE_RADIUS),
    ]);
  });
});
