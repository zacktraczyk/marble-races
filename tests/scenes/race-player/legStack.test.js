import { describe, expect, test } from "bun:test";
import { computeLegStackLayout } from "@scenes/race-player/legStack";

const leg = (id, size) => ({
  id,
  name: id,
  level: {
    version: 3,
    name: id,
    size: [...size],
    settings: { wallThickness: 1 },
    objects: [],
  },
});

describe("leg stack layout", () => {
  test("centers leg 0 at the origin", () => {
    const [frame] = computeLegStackLayout([leg("a", [40, 60])]);

    expect(frame.center).toEqual([0, 0]);
    expect(frame.top).toBe(-30);
    expect(frame.bottom).toBe(30);
    expect(frame.size).toEqual([40, 60]);
  });

  test("stacks legs of different sizes edge-to-edge downward", () => {
    const frames = computeLegStackLayout([
      leg("a", [40, 60]),
      leg("b", [20, 100]),
      leg("c", [80, 40]),
    ]);

    expect(frames.map((frame) => frame.index)).toEqual([0, 1, 2]);
    frames.forEach((frame) => expect(frame.center[0]).toBe(0));

    // Edges touch: each top equals the previous bottom.
    expect(frames[1].top).toBe(frames[0].bottom);
    expect(frames[2].top).toBe(frames[1].bottom);

    // Centers offset by the stacked heights.
    expect(frames[0].center).toEqual([0, 0]);
    expect(frames[1].center).toEqual([0, 30 + 50]);
    expect(frames[2].center).toEqual([0, 130 + 20]);

    // top/bottom derive from center and height.
    frames.forEach((frame) => {
      expect(frame.top).toBe(frame.center[1] - frame.size[1] / 2);
      expect(frame.bottom).toBe(frame.center[1] + frame.size[1] / 2);
    });
  });

  test("returns an empty layout for no legs", () => {
    expect(computeLegStackLayout([])).toEqual([]);
  });

  test("extends a frame when the packed rack outgrows the saved one", () => {
    const legWithRack = (id, size, rackHeight) => {
      const document = leg(id, size);
      document.level.objects.push({
        id: `${id}-finish`,
        prefab: "finish-zone",
        locked: true,
        transform: { position: [0, size[1] / 2 - rackHeight / 2] },
        properties: { width: size[0], height: rackHeight, color: [1, 1, 1, 1] },
      });
      return document;
    };
    const plan = (rackHeight) => ({
      legIndex: 0,
      activeTeams: 2,
      marblesPerTeam: 100,
      marbleRadius: 4.8,
      rackHeight,
    });

    const frames = computeLegStackLayout(
      [legWithRack("a", [40, 60], 10), legWithRack("b", [20, 100], 10)],
      [plan(25), plan(4)]
    );

    // Leg 0's rack grows by 15, so its frame is 15 taller than the level.
    expect(frames[0].size).toEqual([40, 75]);
    // Leg 1's rack shrinks by 6; the frame follows so the rack's bottom wall
    // stays flush against the next leg with no dead strip.
    expect(frames[1].size).toEqual([20, 94]);
    expect(frames[1].top).toBe(frames[0].bottom);
  });
});
