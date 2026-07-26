import { describe, expect, test } from "bun:test";
import { getLevelObjectShape } from "@game/level/geometry";
import { getRotationHandle } from "@scenes/leg-builder/editor/geometry";
import { ROTATION_HANDLE_OFFSET } from "@scenes/leg-builder/editor/constants";
import {
  endpointAt,
  findWallEndpointTarget,
  resizeHandleAt,
  rotationHandleAt,
} from "@scenes/leg-builder/editor/hitTest";

const wall = (overrides = {}) => ({
  id: "wall",
  prefab: "wall",
  properties: {
    start: [-50, 0],
    end: [50, 0],
    thickness: 40,
    color: [1, 1, 1, 1],
  },
  ...overrides,
});

const finishZone = (overrides = {}) => ({
  id: "finish",
  prefab: "finish-zone",
  transform: { position: [0, 0], rotation: 0 },
  properties: { width: 100, height: 40, color: [1, 1, 1, 1] },
  ...overrides,
});

const createHandleDeps = (objects, overrides = {}) => ({
  worldToScreen: (point) => point,
  screenDistance: (first, second) =>
    Math.hypot(first[0] - second[0], first[1] - second[1]),
  getObjects: () => objects,
  getDefaultWallThickness: () => 25,
  cameraZoom: 1,
  ...overrides,
});

describe("leg editor handles", () => {
  test("endpointAt detects start and end within the hit radius", () => {
    const deps = createHandleDeps([]);
    const object = wall();

    expect(endpointAt(deps, object, [-50, 0])).toBe("start");
    expect(endpointAt(deps, object, [50, 0])).toBe("end");
    expect(endpointAt(deps, object, [-50, 6])).toBe("start");
    expect(endpointAt(deps, object, [50, -7])).toBe("end");
  });

  test("endpointAt returns null for non-walls and far points", () => {
    const deps = createHandleDeps([]);

    expect(endpointAt(deps, finishZone(), [0, 0])).toBeNull();
    expect(endpointAt(deps, wall(), [0, 0])).toBeNull();
    expect(endpointAt(deps, wall(), [-50, 20])).toBeNull();
  });

  test("findWallEndpointTarget picks the nearest endpoint", () => {
    const near = wall({
      id: "near",
      properties: {
        start: [0, 0],
        end: [20, 0],
        thickness: 40,
        color: [1, 1, 1, 1],
      },
    });
    const far = wall({
      id: "far",
      properties: {
        start: [200, 0],
        end: [240, 0],
        thickness: 40,
        color: [1, 1, 1, 1],
      },
    });
    const deps = createHandleDeps([near, far]);

    const target = findWallEndpointTarget(deps, [2, 1], 12);
    expect(target?.objectId).toBe("near");
    expect(target?.endpoint).toBe("start");
    expect(target?.position).toEqual([0, 0]);
  });

  test("findWallEndpointTarget respects exclusion and locked selectable-only filtering", () => {
    const primary = wall({
      id: "primary",
      properties: {
        start: [0, 0],
        end: [10, 0],
        thickness: 40,
        color: [1, 1, 1, 1],
      },
    });
    const exclusionDeps = createHandleDeps([primary]);

    const excluded = findWallEndpointTarget(exclusionDeps, [1, 0], 12, {
      exclude: { objectId: "primary", endpoint: "start" },
    });
    expect(excluded?.objectId).toBe("primary");
    expect(excluded?.endpoint).toBe("end");

    const locked = wall({
      id: "locked",
      locked: true,
      properties: {
        start: [0, 0],
        end: [5, 0],
        thickness: 40,
        color: [1, 1, 1, 1],
      },
    });
    const unlocked = wall({
      id: "unlocked",
      properties: {
        start: [8, 0],
        end: [40, 0],
        thickness: 40,
        color: [1, 1, 1, 1],
      },
    });
    const selectableDeps = createHandleDeps([locked, unlocked]);

    const selectable = findWallEndpointTarget(selectableDeps, [0, 0], 12, {
      selectableOnly: true,
    });
    expect(selectable?.objectId).toBe("unlocked");
    expect(selectable?.endpoint).toBe("start");
  });

  test("resizeHandleAt and rotationHandleAt miss walls but hit finish-zone handles", () => {
    const deps = createHandleDeps([]);
    const finish = finishZone();
    const finishShape = getLevelObjectShape(finish);
    const rotationHandle = getRotationHandle(
      finishShape,
      ROTATION_HANDLE_OFFSET
    ).position;

    expect(resizeHandleAt(deps, wall(), [50, 0])).toBeNull();
    expect(rotationHandleAt(deps, wall(), rotationHandle)).toBe(false);

    expect(resizeHandleAt(deps, finish, [50, 0])).toBe("e");
    expect(rotationHandleAt(deps, finish, rotationHandle)).toBe(true);
    expect(rotationHandleAt(deps, finish, [0, 0])).toBe(false);
  });
});
